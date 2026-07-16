"""
Tests for model management endpoints:
  POST /check-models
  POST /local-models
  POST /install-local-model
  POST /local-model-status
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


@pytest.fixture(autouse=True)
def reset_model_install_state():
    from app import create_process_status, process_status_by_model

    for model_id in list(process_status_by_model.keys()):
        process_status_by_model[model_id].clear()
        process_status_by_model[model_id].update(create_process_status())

    yield

    for model_id in list(process_status_by_model.keys()):
        process_status_by_model[model_id].clear()
        process_status_by_model[model_id].update(create_process_status())


# ---------------------------------------------------------------------------
# /check-models
# ---------------------------------------------------------------------------

class TestCheckModels:
    def test_both_models_present(self, client):
        with patch("app.is_model_installed", return_value=True):
            resp = _post(client, "/check-models")
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["llama2_exists"] is True
        assert data["mistral_exists"] is True

    def test_no_models_installed(self, client):
        with patch("app.is_model_installed", return_value=False):
            resp = _post(client, "/check-models")
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["llama2_exists"] is False
        assert data["mistral_exists"] is False


class TestLocalModels:
    def test_returns_local_model_registry(self, client):
        with patch("app.is_model_installed", return_value=False):
            resp = _post(client, "/local-models")

        assert resp.status_code == 200
        data = resp.get_json()
        assert data["default_model_type"] == 0
        assert len(data["models"]) >= 2
        assert data["models"][0]["tag"] == "qwen3:8b"
        assert data["models"][1]["tag"] == "llama3.1:8b"


# ---------------------------------------------------------------------------
# /install-llama
# ---------------------------------------------------------------------------

class TestInstallLlama:
    def test_install_initiates_successfully(self, client):
        with patch("app.threading.Thread") as mock_thread, patch(
            "app.resolve_ollama_binary", return_value="/usr/local/bin/ollama"
        ), patch("app.is_model_installed", return_value=False):
            mock_thread.return_value.start = MagicMock()
            resp = _post(client, "/install-llama")
        assert resp.status_code == 200
        data = resp.get_json()
        assert data.get("success") is True

    def test_install_returns_json(self, client):
        with patch("app.threading.Thread") as mock_thread, patch(
            "app.resolve_ollama_binary", return_value="/usr/local/bin/ollama"
        ), patch("app.is_model_installed", return_value=False):
            mock_thread.return_value.start = MagicMock()
            resp = _post(client, "/install-llama")
        assert resp.content_type == "application/json"


# ---------------------------------------------------------------------------
# /install-mistral
# ---------------------------------------------------------------------------

class TestInstallMistral:
    def test_install_initiates_successfully(self, client):
        with patch("app.threading.Thread") as mock_thread, patch(
            "app.resolve_ollama_binary", return_value="/usr/local/bin/ollama"
        ), patch("app.is_model_installed", return_value=False):
            mock_thread.return_value.start = MagicMock()
            resp = _post(client, "/install-mistral")
        assert resp.status_code == 200
        assert resp.get_json().get("success") is True


class TestInstallLocalModel:
    def test_install_selected_model(self, client):
        with patch("app.threading.Thread") as mock_thread, patch(
            "app.resolve_ollama_binary", return_value="/usr/local/bin/ollama"
        ), patch("app.is_model_installed", return_value=False):
            mock_thread.return_value.start = MagicMock()
            resp = _post(client, "/install-local-model", {"model_type": 1})

        assert resp.status_code == 200
        data = resp.get_json()
        assert data["success"] is True
        assert data["model"]["tag"] == "llama3.1:8b"

    def test_install_reports_already_installed(self, client):
        with patch("app.is_model_installed", return_value=True):
            resp = _post(client, "/install-local-model", {"model_type": 0})

        assert resp.status_code == 200
        data = resp.get_json()
        assert data["success"] is True
        assert data["already_installed"] is True

    def test_install_returns_helpful_error_when_ollama_missing(self, client):
        with patch("app.resolve_ollama_binary", return_value=None):
            resp = _post(client, "/install-local-model", {"model_type": 0})

        assert resp.status_code == 400
        data = resp.get_json()
        assert data["success"] is False
        assert "Ollama CLI not found" in data["message"]


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


class TestLocalModelStatus:
    def test_status_for_selected_model(self, client):
        resp = _post(client, "/local-model-status", {"model_type": 1})
        assert resp.status_code == 200
        data = resp.get_json()
        assert "running" in data
        assert data["model"]["tag"] == "llama3.1:8b"

    def test_invalid_model_type_falls_back_to_default_model(self, client):
        resp = _post(client, "/local-model-status", {"model_type": "invalid"})
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["model"]["tag"] == "qwen3:8b"


# ---------------------------------------------------------------------------
# /change-chat-mode
# ---------------------------------------------------------------------------

class TestChangeChatMode:
    def test_change_to_mistral(self, client):
        with patch(
            "app.reset_chat_db",
            return_value="Successfully deleted",
        ), patch(
            "app.change_chat_mode_db"
        ):
            resp = _post(client, "/change-chat-mode", {"model_type": 1, "chat_id": 1})
        assert resp.status_code == 200

    def test_change_to_llama(self, client):
        with patch(
            "app.reset_chat_db",
            return_value="Successfully deleted",
        ), patch(
            "app.change_chat_mode_db"
        ):
            resp = _post(client, "/change-chat-mode", {"model_type": 0, "chat_id": 1})
        assert resp.status_code == 200


# ---------------------------------------------------------------------------
# /add-model-key
# ---------------------------------------------------------------------------

class TestAddModelKey:
    def test_add_key_success(self, client):
        with patch("app.add_model_key_to_db"):
            resp = _post(client, "/add-model-key", {"model_key": "sk-test123", "chat_id": 1})
        assert resp.status_code == 200

    def test_add_null_key_to_reset(self, client):
        with patch("app.add_model_key_to_db"):
            resp = _post(client, "/add-model-key", {"model_key": None, "chat_id": 1})
        assert resp.status_code == 200
