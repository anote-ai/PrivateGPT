"""
Tests for model management endpoints:
  POST /check-models
  POST /install-llama
  POST /install-mistral
  POST /llama-status
  POST /mistral-status
  POST /change-chat-mode
  POST /add-model-key
"""
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
# /check-models
# ---------------------------------------------------------------------------

class TestCheckModels:
    def test_both_models_present(self, client):
        with patch("os.path.isdir", return_value=True):
            resp = _post(client, "/check-models")
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["llama2_exists"] is True
        assert data["mistral_exists"] is True

    def test_no_models_installed(self, client):
        with patch("os.path.isdir", return_value=False):
            resp = _post(client, "/check-models")
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["llama2_exists"] is False
        assert data["mistral_exists"] is False


# ---------------------------------------------------------------------------
# /install-llama
# ---------------------------------------------------------------------------

class TestInstallLlama:
    def test_install_initiates_successfully(self, client):
        with patch("threading.Thread") as mock_thread:
            mock_thread.return_value.start = MagicMock()
            resp = _post(client, "/install-llama")
        assert resp.status_code == 200
        data = resp.get_json()
        assert data.get("success") is True

    def test_install_returns_json(self, client):
        with patch("threading.Thread") as mock_thread:
            mock_thread.return_value.start = MagicMock()
            resp = _post(client, "/install-llama")
        assert resp.content_type == "application/json"


# ---------------------------------------------------------------------------
# /install-mistral
# ---------------------------------------------------------------------------

class TestInstallMistral:
    def test_install_initiates_successfully(self, client):
        with patch("threading.Thread") as mock_thread:
            mock_thread.return_value.start = MagicMock()
            resp = _post(client, "/install-mistral")
        assert resp.status_code == 200
        assert resp.get_json().get("success") is True


# ---------------------------------------------------------------------------
# /llama-status
# ---------------------------------------------------------------------------

class TestLlamaStatus:
    def test_status_idle(self, client):
        resp = _post(client, "/llama-status")
        assert resp.status_code == 200
        data = resp.get_json()
        # Should return at minimum a 'running' field
        assert "running" in data

    def test_status_fields_present(self, client):
        resp = _post(client, "/llama-status")
        data = resp.get_json()
        assert "running" in data
        assert "completed" in data


# ---------------------------------------------------------------------------
# /mistral-status
# ---------------------------------------------------------------------------

class TestMistralStatus:
    def test_status_idle(self, client):
        resp = _post(client, "/mistral-status")
        assert resp.status_code == 200
        assert "running" in resp.get_json()


# ---------------------------------------------------------------------------
# /change-chat-mode
# ---------------------------------------------------------------------------

class TestChangeChatMode:
    def test_change_to_mistral(self, client):
        with patch(
            "api_endpoints.financeGPT.chatbot_endpoints.reset_chat_db",
            return_value="Successfully deleted",
        ), patch(
            "api_endpoints.financeGPT.chatbot_endpoints.change_chat_mode_db"
        ):
            resp = _post(client, "/change-chat-mode", {"model_type": 1, "chat_id": 1})
        assert resp.status_code == 200

    def test_change_to_llama(self, client):
        with patch(
            "api_endpoints.financeGPT.chatbot_endpoints.reset_chat_db",
            return_value="Successfully deleted",
        ), patch(
            "api_endpoints.financeGPT.chatbot_endpoints.change_chat_mode_db"
        ):
            resp = _post(client, "/change-chat-mode", {"model_type": 0, "chat_id": 1})
        assert resp.status_code == 200


# ---------------------------------------------------------------------------
# /add-model-key
# ---------------------------------------------------------------------------

class TestAddModelKey:
    def test_add_key_success(self, client):
        with patch("api_endpoints.financeGPT.chatbot_endpoints.add_model_key_to_db"):
            resp = _post(client, "/add-model-key", {"model_key": "sk-test123", "chat_id": 1})
        assert resp.status_code == 200

    def test_add_null_key_to_reset(self, client):
        with patch("api_endpoints.financeGPT.chatbot_endpoints.add_model_key_to_db"):
            resp = _post(client, "/add-model-key", {"model_key": None, "chat_id": 1})
        assert resp.status_code == 200
