"""
Tests for document management endpoints:
  POST /ingest-metadata
  POST /ingest-files/<chat_id>/<token>
  POST /retrieve-current-docs
  POST /delete-doc
  POST /process-message-pdf
"""
import io
import json
import pytest
from unittest.mock import patch, MagicMock


def _post(client, url, payload=None):
    return client.post(
        url,
        data=json.dumps(payload or {}),
        content_type="application/json",
    )


# ---------------------------------------------------------------------------
# /ingest-metadata
# ---------------------------------------------------------------------------

class TestIngestMetadata:
    def test_returns_upload_url(self, client):
        resp = _post(client, "/ingest-metadata", {"chat_id": 1})
        assert resp.status_code == 200
        data = resp.get_json()
        assert "uploadUrl" in data
        assert "ingest-files/1/" in data["uploadUrl"]

    def test_upload_url_contains_unique_token(self, client):
        resp1 = _post(client, "/ingest-metadata", {"chat_id": 1})
        resp2 = _post(client, "/ingest-metadata", {"chat_id": 1})
        url1 = resp1.get_json()["uploadUrl"]
        url2 = resp2.get_json()["uploadUrl"]
        # Each call should produce a different token
        assert url1 != url2


# ---------------------------------------------------------------------------
# /retrieve-current-docs
# ---------------------------------------------------------------------------

class TestRetrieveCurrentDocs:
    def test_returns_documents(self, client):
        mock_docs = [
            {"document_name": "report.pdf", "id": 1},
            {"document_name": "10k.pdf", "id": 2},
        ]
        with patch(
            "api_endpoints.financeGPT.chatbot_endpoints.retrieve_docs_from_db",
            return_value=mock_docs,
        ):
            resp = _post(client, "/retrieve-current-docs", {"chat_id": 1})
        assert resp.status_code == 200
        data = resp.get_json()
        assert len(data["doc_info"]) == 2
        assert data["doc_info"][0]["document_name"] == "report.pdf"

    def test_returns_empty_when_no_docs(self, client):
        with patch(
            "api_endpoints.financeGPT.chatbot_endpoints.retrieve_docs_from_db",
            return_value=[],
        ):
            resp = _post(client, "/retrieve-current-docs", {"chat_id": 99})
        assert resp.status_code == 200
        assert resp.get_json()["doc_info"] == []


# ---------------------------------------------------------------------------
# /delete-doc
# ---------------------------------------------------------------------------

class TestDeleteDoc:
    def test_deletes_doc_successfully(self, client):
        with patch(
            "api_endpoints.financeGPT.chatbot_endpoints.delete_doc_from_db",
            return_value="success",
        ):
            resp = _post(client, "/delete-doc", {"doc_id": 1})
        assert resp.status_code == 200

    def test_delete_nonexistent_doc(self, client):
        with patch(
            "api_endpoints.financeGPT.chatbot_endpoints.delete_doc_from_db",
            return_value="success",
        ):
            resp = _post(client, "/delete-doc", {"doc_id": 9999})
        assert resp.status_code == 200


# ---------------------------------------------------------------------------
# /ingest-files (multipart upload)
# ---------------------------------------------------------------------------

class TestIngestFiles:
    def _make_pdf_upload(self, client, chat_id, token, filename, content):
        """Helper to POST a fake PDF as multipart/form-data."""
        data = {"files[]": (io.BytesIO(content), filename)}
        return client.post(
            f"/ingest-files/{chat_id}/{token}",
            data=data,
            content_type="multipart/form-data",
        )

    def test_ingest_single_file_success(self, client):
        fake_text = "Annual revenue was $5 billion."
        with patch(
            "app.get_text_from_single_file", return_value=fake_text
        ), patch(
            "api_endpoints.financeGPT.chatbot_endpoints.add_document_to_db",
            return_value=(1, False),
        ), patch(
            "api_endpoints.financeGPT.chatbot_endpoints.chunk_document"
        ):
            resp = self._make_pdf_upload(
                client, 1, "test-token", "report.pdf", b"%PDF-1.4 fake content"
            )
        assert resp.status_code == 200
        assert resp.get_json()["status"] == "success"

    def test_ingest_skips_existing_document(self, client):
        """If the document already exists (doesExist=True) chunking is skipped."""
        with patch(
            "app.get_text_from_single_file", return_value="Some text"
        ), patch(
            "api_endpoints.financeGPT.chatbot_endpoints.add_document_to_db",
            return_value=(1, True),   # doesExist = True
        ) as mock_add, patch(
            "api_endpoints.financeGPT.chatbot_endpoints.chunk_document"
        ) as mock_chunk:
            resp = self._make_pdf_upload(
                client, 1, "test-token", "existing.pdf", b"%PDF fake"
            )
        assert resp.status_code == 200
        mock_chunk.assert_not_called()


# ---------------------------------------------------------------------------
# /process-message-pdf — response generation
# ---------------------------------------------------------------------------

class TestProcessMessagePdf:
    def _payload(self, message="What is the revenue?", chat_id=1, model_type=0, model_key=""):
        return {
            "message": message,
            "chat_id": chat_id,
            "model_type": model_type,
            "model_key": model_key,
        }

    def test_llama2_response(self, client):
        mock_ollama_resp = {"message": {"content": "Revenue was $5B."}}
        with patch(
            "api_endpoints.financeGPT.chatbot_endpoints.get_relevant_chunks",
            return_value=[("Revenue data: $5B", "report.pdf")],
        ), patch(
            "api_endpoints.financeGPT.chatbot_endpoints.add_message_to_db",
            return_value=1,
        ), patch(
            "api_endpoints.financeGPT.chatbot_endpoints.add_sources_to_db"
        ), patch("ollama.chat", return_value=mock_ollama_resp):
            resp = _post(client, "/process-message-pdf", self._payload(model_type=0))
        assert resp.status_code == 200
        assert resp.get_json()["answer"] == "Revenue was $5B."

    def test_mistral_response(self, client):
        mock_ollama_resp = {"message": {"content": "Net income was $1.2B."}}
        with patch(
            "api_endpoints.financeGPT.chatbot_endpoints.get_relevant_chunks",
            return_value=[("Net income: $1.2B", "report.pdf")],
        ), patch(
            "api_endpoints.financeGPT.chatbot_endpoints.add_message_to_db",
            return_value=2,
        ), patch(
            "api_endpoints.financeGPT.chatbot_endpoints.add_sources_to_db"
        ), patch("ollama.chat", return_value=mock_ollama_resp):
            resp = _post(client, "/process-message-pdf", self._payload(model_type=1))
        assert resp.status_code == 200
        assert "1.2B" in resp.get_json()["answer"]

    def test_llama2_failure_returns_500(self, client):
        with patch(
            "api_endpoints.financeGPT.chatbot_endpoints.get_relevant_chunks",
            return_value=[],
        ), patch(
            "api_endpoints.financeGPT.chatbot_endpoints.add_message_to_db",
            return_value=1,
        ), patch("ollama.chat", side_effect=Exception("model not found")):
            resp = _post(client, "/process-message-pdf", self._payload(model_type=0))
        assert resp.status_code == 500
