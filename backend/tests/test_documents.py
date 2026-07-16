"""
Tests for document management endpoints:
  POST /download-chat-history
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


def _create_chat(client, chat_type=2):
    """Create a chat owned by the requesting (local) user and return its id.

    Chat-scoped routes now verify ownership, so tests must operate on a chat
    that actually exists in the test database."""
    resp = _post(client, "/create-new-chat", {"chat_type": chat_type, "model_type": 0})
    return resp.get_json()["chat_id"]


# ---------------------------------------------------------------------------
# /download-chat-history
# ---------------------------------------------------------------------------

class TestDownloadChatHistory:
    def test_returns_csv_attachment(self, client):
        chat_id = _create_chat(client)
        messages = [
            {"sent_from_user": 1, "message_text": "What changed this quarter?"},
            {"sent_from_user": 0, "message_text": "Revenue increased 12% year over year."},
        ]
        with patch(
            "app.retrieve_message_from_db",
            return_value=messages,
        ):
            resp = _post(client, "/download-chat-history", {"chat_id": chat_id, "chat_type": 0})

        assert resp.status_code == 200
        assert resp.mimetype == "text/csv"
        assert f"attachment; filename=chat-history-{chat_id}.csv" in resp.headers["Content-Disposition"]
        decoded_body = resp.data.decode("utf-8")
        assert "Query,Response" in decoded_body
        assert "What changed this quarter?" in decoded_body

    def test_requires_chat_id(self, client):
        resp = _post(client, "/download-chat-history", {"chat_type": 0})
        assert resp.status_code == 400
        assert resp.get_json()["error"] == "chat_id is required."


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
            "app.retrieve_docs_from_db",
            return_value=mock_docs,
        ):
            resp = _post(client, "/retrieve-current-docs", {"chat_id": 1})
        assert resp.status_code == 200
        data = resp.get_json()
        assert len(data["doc_info"]) == 2
        assert data["doc_info"][0]["document_name"] == "report.pdf"

    def test_returns_empty_when_no_docs(self, client):
        with patch(
            "app.retrieve_docs_from_db",
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
            "app.delete_doc_from_db",
            return_value="success",
        ):
            resp = _post(client, "/delete-doc", {"doc_id": 1})
        assert resp.status_code == 200

    def test_delete_nonexistent_doc(self, client):
        with patch(
            "app.delete_doc_from_db",
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
        chat_id = _create_chat(client)
        fake_text = "Annual revenue was $5 billion."
        with patch(
            "app.is_model_installed",
            return_value=True,
        ), patch(
            "app.get_text_from_single_file", return_value=fake_text
        ), patch(
            "app.add_document_to_db",
            return_value=(1, False),
        ), patch(
            "app.chunk_document"
        ):
            resp = self._make_pdf_upload(
                client, chat_id, "test-token", "report.pdf", b"%PDF-1.4 fake content"
            )
        assert resp.status_code == 200
        assert resp.get_json()["status"] == "success"

    def test_ingest_skips_existing_document(self, client):
        """If the document already exists (doesExist=True) chunking is skipped."""
        chat_id = _create_chat(client)
        with patch(
            "app.is_model_installed",
            return_value=True,
        ), patch(
            "app.get_text_from_single_file", return_value="Some text"
        ), patch(
            "app.add_document_to_db",
            return_value=(1, True),   # doesExist = True
        ) as mock_add, patch(
            "app.chunk_document"
        ) as mock_chunk:
            resp = self._make_pdf_upload(
                client, chat_id, "test-token", "existing.pdf", b"%PDF fake"
            )
        assert resp.status_code == 200
        mock_chunk.assert_not_called()

    def test_rejects_non_pdf_uploads(self, client):
        chat_id = _create_chat(client)
        with patch("app.is_model_installed", return_value=True):
            resp = self._make_pdf_upload(
                client, chat_id, "test-token", "notes.txt", b"plain text content"
            )
        assert resp.status_code == 400
        assert resp.get_json()["error"] == "Only PDF uploads are supported right now."

    def test_returns_helpful_error_when_embedding_model_missing(self, client):
        chat_id = _create_chat(client)
        with patch("app.is_model_installed", return_value=False):
            resp = self._make_pdf_upload(
                client, chat_id, "test-token", "report.pdf", b"%PDF-1.4 fake content"
            )

        assert resp.status_code == 503
        assert "embedding model" in resp.get_json()["error"]


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

    def test_primary_local_model_response(self, client):
        chat_id = _create_chat(client)
        mock_ollama_resp = {"message": {"content": "Revenue was $5B."}}
        with patch(
            "app.get_relevant_chunks",
            return_value=[("Revenue data: $5B", "report.pdf")],
        ), patch(
            "app.add_message_to_db",
            return_value=1,
        ), patch(
            "app.add_sources_to_db"
        ), patch("ollama.chat", return_value=mock_ollama_resp) as mock_chat:
            resp = _post(client, "/process-message-pdf", self._payload(model_type=0, chat_id=chat_id))
        assert resp.status_code == 200
        assert resp.get_json()["answer"] == "Revenue was $5B."
        assert mock_chat.call_args.kwargs["model"] == "qwen3:8b"

    def test_secondary_local_model_response(self, client):
        chat_id = _create_chat(client)
        mock_ollama_resp = {"message": {"content": "Net income was $1.2B."}}
        with patch(
            "app.get_relevant_chunks",
            return_value=[("Net income: $1.2B", "report.pdf")],
        ), patch(
            "app.add_message_to_db",
            return_value=2,
        ), patch(
            "app.add_sources_to_db"
        ), patch("ollama.chat", return_value=mock_ollama_resp) as mock_chat:
            resp = _post(client, "/process-message-pdf", self._payload(model_type=1, chat_id=chat_id))
        assert resp.status_code == 200
        assert "1.2B" in resp.get_json()["answer"]
        assert mock_chat.call_args.kwargs["model"] == "llama3.1:8b"

    def test_local_model_failure_returns_500(self, client):
        chat_id = _create_chat(client)
        with patch(
            "app.get_relevant_chunks",
            return_value=[],
        ), patch(
            "app.add_message_to_db",
            return_value=1,
        ), patch("ollama.chat", side_effect=Exception("model not found")):
            resp = _post(client, "/process-message-pdf", self._payload(model_type=0, chat_id=chat_id))
        assert resp.status_code == 500
        assert "Qwen 3 8B" in resp.get_json()["error"]


# ---------------------------------------------------------------------------
# /process-ticker-info
# ---------------------------------------------------------------------------

class TestProcessTickerInfo:
    def test_requires_ticker(self, client):
        resp = _post(client, "/process-ticker-info", {"chat_id": 1, "ticker": ""})
        assert resp.status_code == 400
        assert resp.get_json()["error"] == "Ticker is required."

    def test_returns_success_when_processing_completes(self, client):
        chat_id = _create_chat(client, chat_type=1)
        with patch(
            "app.is_model_installed",
            return_value=True,
        ), patch(
            "app.reset_uploaded_docs"
        ), patch(
            "app.download_10K_url_ticker",
            return_value=("https://example.com/10k.pdf", "AAPL"),
        ), patch(
            "app.download_filing_as_pdf",
            return_value="/tmp/aapl-10k.pdf",
        ), patch(
            "app.get_text_from_single_file",
            return_value="10-K filing text",
        ), patch(
            "app.add_document_to_db",
            return_value=(1, False),
        ), patch(
            "app.chunk_document"
        ), patch(
            "app.os.path.exists",
            return_value=True,
        ), patch(
            "app.os.remove"
        ):
            resp = _post(client, "/process-ticker-info", {"chat_id": chat_id, "ticker": "AAPL"})

        assert resp.status_code == 200
        assert resp.get_json()["status"] == "success"
