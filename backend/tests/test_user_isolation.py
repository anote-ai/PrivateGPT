"""Tests for session-based user identity and per-user data isolation.

Covers the fix for the hardcoded USER_ID=1 placeholder: the backend now
resolves the acting user from the Authorization session token and falls back
to an auto-provisioned local single-user account for desktop mode.

Run from backend/:  pytest tests/
"""
import io
import os
import sys
import tempfile
from datetime import datetime, timedelta

import pytest

# app reads DB_PATH at request time; point it at a fresh temp DB before import.
_TMPDIR = tempfile.mkdtemp()
os.environ["DB_PATH"] = os.path.join(_TMPDIR, "test.db")

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app import app  # noqa: E402
from api_endpoints.financeGPT.chatbot_endpoints import get_db_connection  # noqa: E402


@pytest.fixture()
def client():
    return app.test_client()


def _create_user_with_token(token, expiration):
    conn, cursor = get_db_connection()
    cursor.execute(
        "INSERT INTO users (session_token, session_token_expiration, credits) VALUES (?, ?, 0)",
        (token, expiration),
    )
    conn.commit()
    user_id = cursor.lastrowid
    conn.close()
    return user_id


def _future():
    return (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d %H:%M:%S")


def _past():
    return (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d %H:%M:%S")


def test_desktop_mode_auto_provisions_local_user(client):
    response = client.post("/create-new-chat", json={"chat_type": 0, "model_type": 0})
    assert response.status_code == 200
    chat_id = response.get_json()["chat_id"]

    chats = client.post("/retrieve-all-chats", json={}).get_json()["chat_info"]
    assert any(chat["id"] == chat_id for chat in chats)

    conn, cursor = get_db_connection()
    cursor.execute("SELECT count(*) AS n FROM users")
    assert cursor.fetchone()["n"] == 1
    cursor.execute("SELECT user_id FROM chats WHERE id = ?", (chat_id,))
    owner_id = cursor.fetchone()["user_id"]
    cursor.execute("SELECT id FROM users")
    assert owner_id == cursor.fetchone()["id"]
    conn.close()


def test_users_cannot_see_each_others_data(client):
    chat_a = client.post("/create-new-chat", json={"chat_type": 0, "model_type": 0}).get_json()["chat_id"]

    _create_user_with_token("token-user-b", _future())
    headers_b = {"Authorization": "Bearer token-user-b"}

    assert client.post("/retrieve-all-chats", json={}, headers=headers_b).get_json()["chat_info"] == []

    chat_b = client.post(
        "/create-new-chat", json={"chat_type": 0, "model_type": 0}, headers=headers_b
    ).get_json()["chat_id"]

    b_chat_ids = [c["id"] for c in client.post("/retrieve-all-chats", json={}, headers=headers_b).get_json()["chat_info"]]
    assert b_chat_ids == [chat_b]

    a_chat_ids = [c["id"] for c in client.post("/retrieve-all-chats", json={}).get_json()["chat_info"]]
    assert chat_b not in a_chat_ids

    messages = client.post(
        "/retrieve-messages-from-chat", json={"chat_id": chat_a, "chat_type": 0}, headers=headers_b
    ).get_json()["messages"]
    assert messages == []


def test_user_cannot_modify_another_users_chat(client):
    chat_a = client.post("/create-new-chat", json={"chat_type": 0, "model_type": 0}).get_json()["chat_id"]

    _create_user_with_token("token-user-c", _future())
    headers_c = {"Authorization": "Bearer token-user-c"}

    client.post("/update-chat-name", json={"chat_id": chat_a, "chat_name": "hacked"}, headers=headers_c)
    chats = client.post("/retrieve-all-chats", json={}).get_json()["chat_info"]
    assert all(chat["chat_name"] != "hacked" for chat in chats)

    response = client.post(
        "/process-message-pdf", json={"chat_id": chat_a, "message": "hi", "model_type": 0}, headers=headers_c
    )
    assert response.status_code == 404

    response = client.post(
        f"/ingest-files/{chat_a}/upload-token",
        data={"files[]": (io.BytesIO(b"%PDF-1.4"), "x.pdf")},
        content_type="multipart/form-data",
        headers=headers_c,
    )
    assert response.status_code == 404

    client.post("/delete-chat", json={"chat_id": chat_a}, headers=headers_c)
    conn, cursor = get_db_connection()
    cursor.execute("SELECT 1 FROM chats WHERE id = ?", (chat_a,))
    assert cursor.fetchone() is not None
    conn.close()


def test_expired_token_falls_back_to_local_user(client):
    local_chat_ids = [c["id"] for c in client.post("/retrieve-all-chats", json={}).get_json()["chat_info"]]

    _create_user_with_token("token-expired", _past())
    headers = {"Authorization": "Bearer token-expired"}

    chat_ids = [c["id"] for c in client.post("/retrieve-all-chats", json={}, headers=headers).get_json()["chat_info"]]
    assert chat_ids == local_chat_ids


def test_owner_can_delete_own_chat(client):
    chat_id = client.post("/create-new-chat", json={"chat_type": 0, "model_type": 0}).get_json()["chat_id"]
    response = client.post("/delete-chat", json={"chat_id": chat_id})
    assert b"Successfully deleted" in response.data
