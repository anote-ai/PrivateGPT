"""
Tests for chat management endpoints:
  POST /create-new-chat
  POST /retrieve-all-chats
  POST /retrieve-messages-from-chat
  POST /update-chat-name
  POST /delete-chat
  POST /find-most-recent-chat
  POST /reset-chat
"""
import json
import pytest
from unittest.mock import patch, MagicMock


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _post(client, url, payload=None):
    return client.post(
        url,
        data=json.dumps(payload or {}),
        content_type="application/json",
    )


# ---------------------------------------------------------------------------
# /create-new-chat
# ---------------------------------------------------------------------------

class TestCreateNewChat:
    def test_creates_chat_returns_id(self, client):
        with patch(
            "api_endpoints.financeGPT.chatbot_endpoints.add_chat_to_db",
            return_value=42,
        ):
            resp = _post(client, "/create-new-chat", {"chat_type": 0, "model_type": 0})
        assert resp.status_code == 200
        data = resp.get_json()
        assert "chat_id" in data
        assert data["chat_id"] == 42

    def test_creates_edgar_chat(self, client):
        with patch(
            "api_endpoints.financeGPT.chatbot_endpoints.add_chat_to_db",
            return_value=7,
        ):
            resp = _post(client, "/create-new-chat", {"chat_type": 1, "model_type": 1})
        assert resp.status_code == 200
        assert resp.get_json()["chat_id"] == 7


# ---------------------------------------------------------------------------
# /retrieve-all-chats
# ---------------------------------------------------------------------------

class TestRetrieveAllChats:
    def test_returns_chat_list(self, client):
        mock_chats = [
            {"id": 1, "chat_name": "Chat 1", "model_type": 0, "associated_task": 0, "ticker": None, "custom_model_key": None},
            {"id": 2, "chat_name": "Chat 2", "model_type": 1, "associated_task": 1, "ticker": "AAPL", "custom_model_key": None},
        ]
        with patch(
            "api_endpoints.financeGPT.chatbot_endpoints.retrieve_chats_from_db",
            return_value=mock_chats,
        ):
            resp = _post(client, "/retrieve-all-chats", {})
        assert resp.status_code == 200
        data = resp.get_json()
        assert "chat_info" in data
        assert len(data["chat_info"]) == 2

    def test_returns_empty_list_when_no_chats(self, client):
        with patch(
            "api_endpoints.financeGPT.chatbot_endpoints.retrieve_chats_from_db",
            return_value=[],
        ):
            resp = _post(client, "/retrieve-all-chats", {})
        assert resp.status_code == 200
        assert resp.get_json()["chat_info"] == []


# ---------------------------------------------------------------------------
# /retrieve-messages-from-chat
# ---------------------------------------------------------------------------

class TestRetrieveMessages:
    def test_returns_messages(self, client):
        mock_messages = [
            {"message_text": "Hello", "sent_from_user": 1, "relevant_chunks": None, "created": "2026-01-01"},
            {"message_text": "Hi there!", "sent_from_user": 0, "relevant_chunks": "chunk1", "created": "2026-01-01"},
        ]
        with patch(
            "api_endpoints.financeGPT.chatbot_endpoints.retrieve_message_from_db",
            return_value=mock_messages,
        ):
            resp = _post(client, "/retrieve-messages-from-chat", {"chat_id": 1, "chat_type": 0})
        assert resp.status_code == 200
        data = resp.get_json()
        assert len(data["messages"]) == 2
        assert data["messages"][0]["message_text"] == "Hello"

    def test_returns_empty_messages_for_new_chat(self, client):
        with patch(
            "api_endpoints.financeGPT.chatbot_endpoints.retrieve_message_from_db",
            return_value=[],
        ):
            resp = _post(client, "/retrieve-messages-from-chat", {"chat_id": 99, "chat_type": 0})
        assert resp.status_code == 200
        assert resp.get_json()["messages"] == []


# ---------------------------------------------------------------------------
# /update-chat-name
# ---------------------------------------------------------------------------

class TestUpdateChatName:
    def test_updates_name_successfully(self, client):
        with patch("api_endpoints.financeGPT.chatbot_endpoints.update_chat_name_db"):
            resp = _post(client, "/update-chat-name", {"chat_id": 1, "chat_name": "My Renamed Chat"})
        assert resp.status_code == 200

    def test_update_with_empty_name(self, client):
        with patch("api_endpoints.financeGPT.chatbot_endpoints.update_chat_name_db"):
            resp = _post(client, "/update-chat-name", {"chat_id": 1, "chat_name": ""})
        assert resp.status_code == 200


# ---------------------------------------------------------------------------
# /delete-chat
# ---------------------------------------------------------------------------

class TestDeleteChat:
    def test_deletes_chat_successfully(self, client):
        with patch(
            "api_endpoints.financeGPT.chatbot_endpoints.delete_chat_from_db",
            return_value="Successfully deleted",
        ):
            resp = _post(client, "/delete-chat", {"chat_id": 1})
        assert resp.status_code == 200

    def test_delete_nonexistent_chat(self, client):
        with patch(
            "api_endpoints.financeGPT.chatbot_endpoints.delete_chat_from_db",
            return_value="Could not delete",
        ):
            resp = _post(client, "/delete-chat", {"chat_id": 9999})
        assert resp.status_code == 200


# ---------------------------------------------------------------------------
# /find-most-recent-chat
# ---------------------------------------------------------------------------

class TestFindMostRecentChat:
    def test_returns_most_recent_chat(self, client):
        mock_chat = {"id": 5, "chat_name": "Recent Chat"}
        with patch(
            "api_endpoints.financeGPT.chatbot_endpoints.find_most_recent_chat_from_db",
            return_value=mock_chat,
        ):
            resp = _post(client, "/find-most-recent-chat", {})
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["chat_info"]["id"] == 5

    def test_returns_none_when_no_chats(self, client):
        with patch(
            "api_endpoints.financeGPT.chatbot_endpoints.find_most_recent_chat_from_db",
            return_value=None,
        ):
            resp = _post(client, "/find-most-recent-chat", {})
        assert resp.status_code == 200
        assert resp.get_json()["chat_info"] is None


# ---------------------------------------------------------------------------
# /reset-chat
# ---------------------------------------------------------------------------

class TestResetChat:
    def test_resets_chat_messages(self, client):
        with patch(
            "api_endpoints.financeGPT.chatbot_endpoints.reset_chat_db",
            return_value="Successfully deleted",
        ):
            resp = _post(client, "/reset-chat", {"chat_id": 1})
        assert resp.status_code == 200
