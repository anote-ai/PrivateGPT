"""
Tests for auth-adjacent behavior:
  - Session token handling in request headers
  - /test-flask health check
  - /reset-everything endpoint
  - CORS headers are present on responses
"""
import json
import pytest
from unittest.mock import patch


def _post(client, url, payload=None, headers=None):
    h = {"Content-Type": "application/json"}
    if headers:
        h.update(headers)
    return client.post(url, data=json.dumps(payload or {}), headers=h)


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------

class TestHealthCheck:
    def test_test_flask_endpoint(self, client):
        resp = _post(client, "/test-flask")
        assert resp.status_code == 200
        data = resp.get_json()
        assert data.get("test") == "hello world"


# ---------------------------------------------------------------------------
# /reset-everything
# ---------------------------------------------------------------------------

class TestResetEverything:
    def test_reset_returns_200(self, client):
        resp = _post(client, "/reset-everything")
        assert resp.status_code == 200

    def test_reset_returns_json(self, client):
        resp = _post(client, "/reset-everything")
        data = resp.get_json()
        assert data is not None
        assert "status" in data


# ---------------------------------------------------------------------------
# CORS headers
# ---------------------------------------------------------------------------

class TestCorsHeaders:
    def test_cors_header_present_on_post(self, client):
        resp = _post(
            client,
            "/test-flask",
            headers={"Origin": "http://localhost:3000"},
        )
        assert resp.status_code == 200
        # Flask-CORS should inject Access-Control-Allow-Origin
        assert "Access-Control-Allow-Origin" in resp.headers

    def test_options_preflight(self, client):
        resp = client.options(
            "/create-new-chat",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "Content-Type",
            },
        )
        # Preflight should succeed (200 or 204)
        assert resp.status_code in (200, 204)


# ---------------------------------------------------------------------------
# Authorization header pass-through
# ---------------------------------------------------------------------------

class TestAuthorizationHeader:
    def test_request_with_bearer_token_accepted(self, client):
        """The app should accept (not reject) requests with a Bearer token header."""
        with patch(
            "api_endpoints.financeGPT.chatbot_endpoints.retrieve_chats_from_db",
            return_value=[],
        ):
            resp = _post(
                client,
                "/retrieve-all-chats",
                payload={},
                headers={"Authorization": "Bearer test-session-token"},
            )
        assert resp.status_code == 200

    def test_request_without_token_still_works(self, client):
        """Single-user desktop mode: no auth token required."""
        with patch(
            "api_endpoints.financeGPT.chatbot_endpoints.retrieve_chats_from_db",
            return_value=[],
        ):
            resp = _post(client, "/retrieve-all-chats", payload={})
        assert resp.status_code == 200
