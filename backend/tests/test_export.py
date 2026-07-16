"""
Tests for chat export formats on POST /download-chat-history (issues #28/#30):
CSV (legacy), Markdown report, and printable HTML (used for save-as-PDF).
"""
import json
from datetime import datetime, timedelta

from api_endpoints.financeGPT.chatbot_endpoints import get_db_connection


def _post(client, url, payload=None):
    return client.post(
        url,
        data=json.dumps(payload or {}),
        content_type="application/json",
    )


def _create_chat(client, chat_type=2):
    resp = _post(client, "/create-new-chat", {"chat_type": chat_type, "model_type": 0})
    return resp.get_json()["chat_id"]


def _seed_conversation(chat_id, with_sources=True):
    conn, cursor = get_db_connection()
    cursor.execute(
        "INSERT INTO messages (message_text, chat_id, sent_from_user) VALUES (?, ?, 1)",
        ("What are the main risk factors?", chat_id),
    )
    relevant_chunks = (
        "Document: report.pdf: Supply chain risks are significant...\n\n"
        "Document: 10k.pdf: Battery material costs...\n\n"
        if with_sources
        else None
    )
    cursor.execute(
        "INSERT INTO messages (message_text, chat_id, sent_from_user, relevant_chunks) VALUES (?, ?, 0, ?)",
        ("The filing identifies **five** major risk categories.", chat_id, relevant_chunks),
    )
    cursor.execute(
        "INSERT INTO documents (chat_id, document_name, document_text, storage_key) VALUES (?, ?, ?, ?)",
        (chat_id, "report.pdf", "full text", "temp"),
    )
    conn.commit()
    conn.close()


class TestMarkdownExport:
    def test_markdown_structure_and_citations(self, client):
        chat_id = _create_chat(client)
        _seed_conversation(chat_id)

        resp = _post(client, "/download-chat-history", {"chat_id": chat_id, "chat_type": 2, "format": "md"})

        assert resp.status_code == 200
        assert "text/markdown" in resp.mimetype
        assert ".md" in resp.headers["Content-Disposition"]

        body = resp.data.decode("utf-8")
        assert body.startswith("# ")
        assert "**User:**" in body
        assert "**Assistant:**" in body
        assert "What are the main risk factors?" in body
        assert "> Sources: report.pdf, 10k.pdf" in body
        assert "**Documents:** report.pdf" in body

    def test_markdown_without_sources(self, client):
        chat_id = _create_chat(client)
        _seed_conversation(chat_id, with_sources=False)

        resp = _post(client, "/download-chat-history", {"chat_id": chat_id, "chat_type": 2, "format": "md"})

        assert resp.status_code == 200
        assert "> Sources:" not in resp.data.decode("utf-8")


class TestHtmlExport:
    def test_html_is_printable_document(self, client):
        chat_id = _create_chat(client)
        _seed_conversation(chat_id)

        resp = _post(client, "/download-chat-history", {"chat_id": chat_id, "chat_type": 2, "format": "html"})

        assert resp.status_code == 200
        assert "text/html" in resp.mimetype

        body = resp.data.decode("utf-8")
        assert body.startswith("<!DOCTYPE html>")
        assert "Exported from PrivateGPT" in body
        assert "What are the main risk factors?" in body
        assert "Sources: report.pdf, 10k.pdf" in body

    def test_html_escapes_message_content(self, client):
        chat_id = _create_chat(client)
        conn, cursor = get_db_connection()
        cursor.execute(
            "INSERT INTO messages (message_text, chat_id, sent_from_user) VALUES (?, ?, 1)",
            ("<script>alert('xss')</script>", chat_id),
        )
        conn.commit()
        conn.close()

        resp = _post(client, "/download-chat-history", {"chat_id": chat_id, "chat_type": 2, "format": "html"})

        body = resp.data.decode("utf-8")
        assert "<script>alert" not in body
        assert "&lt;script&gt;" in body


class TestExportValidation:
    def test_csv_remains_default(self, client):
        chat_id = _create_chat(client)
        _seed_conversation(chat_id)

        resp = _post(client, "/download-chat-history", {"chat_id": chat_id, "chat_type": 2})

        assert resp.status_code == 200
        assert resp.mimetype == "text/csv"
        assert "Query,Response" in resp.data.decode("utf-8")

    def test_rejects_unknown_format(self, client):
        chat_id = _create_chat(client)
        resp = _post(client, "/download-chat-history", {"chat_id": chat_id, "chat_type": 2, "format": "docx"})
        assert resp.status_code == 400

    def test_other_users_chat_returns_404(self, client):
        chat_id = _create_chat(client)
        _seed_conversation(chat_id)

        conn, cursor = get_db_connection()
        future = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d %H:%M:%S")
        cursor.execute(
            "INSERT INTO users (session_token, session_token_expiration, credits) VALUES (?, ?, 0)",
            ("export-intruder", future),
        )
        conn.commit()
        conn.close()

        resp = client.post(
            "/download-chat-history",
            data=json.dumps({"chat_id": chat_id, "chat_type": 2, "format": "md"}),
            content_type="application/json",
            headers={"Authorization": "Bearer export-intruder"},
        )
        assert resp.status_code == 404
