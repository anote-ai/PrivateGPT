"""
Tests for the AI-assisted translation feature.

Covers:
  POST /translate-text   — backend endpoint
  translate_text()       — core translation logic (unit tests)

Demo use cases:
  - English → Spanish
  - English → French
  - English → Japanese
  - English → Arabic
  - Auto-detect → German
  - Multi-paragraph document translation
  - Financial jargon translation
  - Error handling (no API key)
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
# Helper: build a mock OpenAI response
# ---------------------------------------------------------------------------

def _mock_openai_response(translated_text: str):
    mock_choice = MagicMock()
    mock_choice.message.content = translated_text
    mock_resp = MagicMock()
    mock_resp.choices = [mock_choice]
    return mock_resp


# ===========================================================================
# Unit tests for translate_text()
# ===========================================================================

class TestTranslateTextUnit:
    """Direct unit tests for the translate_text helper function."""

    def test_english_to_spanish(self):
        from api_endpoints.financeGPT.chatbot_endpoints import translate_text

        mock_client = MagicMock()
        mock_client.chat.completions.create.return_value = _mock_openai_response(
            "Los ingresos anuales fueron de 5.000 millones de dólares."
        )
        with patch("openai.OpenAI", return_value=mock_client):
            result = translate_text(
                "Annual revenue was $5 billion.",
                source_language="English",
                target_language="Spanish",
                model_key="sk-test",
            )
        assert "ingresos" in result.lower() or "5" in result

    def test_english_to_french(self):
        from api_endpoints.financeGPT.chatbot_endpoints import translate_text

        mock_client = MagicMock()
        mock_client.chat.completions.create.return_value = _mock_openai_response(
            "Le chiffre d'affaires annuel était de 5 milliards de dollars."
        )
        with patch("openai.OpenAI", return_value=mock_client):
            result = translate_text(
                "Annual revenue was $5 billion.",
                source_language="English",
                target_language="French",
                model_key="sk-test",
            )
        assert "milliards" in result or "chiffre" in result

    def test_english_to_japanese(self):
        from api_endpoints.financeGPT.chatbot_endpoints import translate_text

        japanese_text = "年間収益は50億ドルでした。"
        mock_client = MagicMock()
        mock_client.chat.completions.create.return_value = _mock_openai_response(japanese_text)
        with patch("openai.OpenAI", return_value=mock_client):
            result = translate_text(
                "Annual revenue was $5 billion.",
                source_language="English",
                target_language="Japanese",
                model_key="sk-test",
            )
        assert result == japanese_text

    def test_english_to_arabic(self):
        from api_endpoints.financeGPT.chatbot_endpoints import translate_text

        arabic_text = "بلغت الإيرادات السنوية 5 مليارات دولار."
        mock_client = MagicMock()
        mock_client.chat.completions.create.return_value = _mock_openai_response(arabic_text)
        with patch("openai.OpenAI", return_value=mock_client):
            result = translate_text(
                "Annual revenue was $5 billion.",
                source_language="English",
                target_language="Arabic",
                model_key="sk-test",
            )
        assert result == arabic_text

    def test_auto_detect_to_german(self):
        from api_endpoints.financeGPT.chatbot_endpoints import translate_text

        mock_client = MagicMock()
        mock_client.chat.completions.create.return_value = _mock_openai_response(
            "Der Jahresumsatz betrug 5 Milliarden Dollar."
        )
        with patch("openai.OpenAI", return_value=mock_client):
            result = translate_text(
                "Annual revenue was $5 billion.",
                source_language="Auto-detect",
                target_language="German",
                model_key="sk-test",
            )
        assert "Milliarden" in result or "Umsatz" in result

    def test_multi_paragraph_translation(self):
        from api_endpoints.financeGPT.chatbot_endpoints import translate_text

        long_text = (
            "Paragraph one discusses our strong fiscal year results.\n\n"
            "Paragraph two outlines risks and mitigation strategies.\n\n"
            "Paragraph three provides our forward guidance for next year."
        )
        translated = (
            "El párrafo uno analiza nuestros sólidos resultados fiscales.\n\n"
            "El párrafo dos describe los riesgos y las estrategias de mitigación.\n\n"
            "El párrafo tres proporciona nuestra guía prospectiva para el próximo año."
        )
        mock_client = MagicMock()
        mock_client.chat.completions.create.return_value = _mock_openai_response(translated)
        with patch("openai.OpenAI", return_value=mock_client):
            result = translate_text(
                long_text,
                source_language="English",
                target_language="Spanish",
                model_key="sk-test",
            )
        assert result == translated

    def test_financial_jargon_translation(self):
        """Financial terms should be translated correctly (EBITDA, P/E ratio etc.)"""
        from api_endpoints.financeGPT.chatbot_endpoints import translate_text

        source = "The EBITDA margin improved by 200 basis points, and the P/E ratio is now 18x."
        translated = "El margen EBITDA mejoró en 200 puntos básicos y la relación P/E es ahora de 18x."
        mock_client = MagicMock()
        mock_client.chat.completions.create.return_value = _mock_openai_response(translated)
        with patch("openai.OpenAI", return_value=mock_client):
            result = translate_text(source, "English", "Spanish", model_key="sk-test")
        assert "EBITDA" in result or "margen" in result

    def test_no_api_key_returns_fallback(self):
        """Without any API key, translate_text returns a user-friendly fallback message."""
        from api_endpoints.financeGPT.chatbot_endpoints import translate_text

        import os
        with patch.dict(os.environ, {"OPENAI_API_KEY": ""}):
            result = translate_text(
                "Hello world",
                source_language="English",
                target_language="French",
                model_key=None,
            )
        assert "API key" in result or "Translation requires" in result

    def test_uses_provided_model_key_over_env(self):
        """When model_key is provided, it should be used directly (not env var)."""
        from api_endpoints.financeGPT.chatbot_endpoints import translate_text

        mock_client = MagicMock()
        mock_client.chat.completions.create.return_value = _mock_openai_response("Hola mundo")
        with patch("openai.OpenAI", return_value=mock_client) as mock_ctor:
            translate_text("Hello world", "English", "Spanish", model_key="sk-custom-key")
        mock_ctor.assert_called_once_with(api_key="sk-custom-key")

    def test_temperature_set_for_accuracy(self):
        """Translation calls should use low temperature for determinism."""
        from api_endpoints.financeGPT.chatbot_endpoints import translate_text

        mock_client = MagicMock()
        mock_client.chat.completions.create.return_value = _mock_openai_response("Bonjour")
        with patch("openai.OpenAI", return_value=mock_client):
            translate_text("Hello", "English", "French", model_key="sk-test")

        call_kwargs = mock_client.chat.completions.create.call_args.kwargs
        assert call_kwargs.get("temperature", 1.0) <= 0.5


# ===========================================================================
# Integration-style tests via the HTTP endpoint
# ===========================================================================

class TestTranslateEndpoint:
    """Tests for POST /translate-text via the Flask test client."""

    def test_english_to_spanish_endpoint(self, client):
        with patch(
            "api_endpoints.financeGPT.chatbot_endpoints.translate_text",
            return_value="Los mercados financieros son volátiles.",
        ):
            resp = _post(client, "/translate-text", {
                "text": "Financial markets are volatile.",
                "source_language": "English",
                "target_language": "Spanish",
                "model_key": "sk-test",
            })
        assert resp.status_code == 200
        data = resp.get_json()
        assert "translation" in data
        assert "mercados" in data["translation"]

    def test_missing_text_returns_400(self, client):
        resp = _post(client, "/translate-text", {
            "text": "",
            "source_language": "English",
            "target_language": "French",
        })
        assert resp.status_code == 400

    def test_english_to_chinese_endpoint(self, client):
        with patch(
            "api_endpoints.financeGPT.chatbot_endpoints.translate_text",
            return_value="年度净利润增长了15%。",
        ):
            resp = _post(client, "/translate-text", {
                "text": "Annual net profit grew by 15%.",
                "source_language": "English",
                "target_language": "Chinese (Simplified)",
                "model_key": "sk-test",
            })
        assert resp.status_code == 200
        assert "translation" in resp.get_json()

    def test_translation_error_returns_500(self, client):
        with patch(
            "api_endpoints.financeGPT.chatbot_endpoints.translate_text",
            side_effect=Exception("OpenAI API error"),
        ):
            resp = _post(client, "/translate-text", {
                "text": "Hello",
                "source_language": "English",
                "target_language": "Korean",
                "model_key": "sk-bad-key",
            })
        assert resp.status_code == 500

    def test_whitespace_only_text_returns_400(self, client):
        resp = _post(client, "/translate-text", {
            "text": "   \n\t  ",
            "source_language": "English",
            "target_language": "German",
        })
        assert resp.status_code == 400

    def test_long_document_translation(self, client):
        """Endpoint should handle large text payloads without error."""
        large_text = "This is a sentence about financial performance. " * 100
        with patch(
            "api_endpoints.financeGPT.chatbot_endpoints.translate_text",
            return_value="C'est une phrase sur la performance financière. " * 100,
        ):
            resp = _post(client, "/translate-text", {
                "text": large_text,
                "source_language": "English",
                "target_language": "French",
                "model_key": "sk-test",
            })
        assert resp.status_code == 200
        data = resp.get_json()
        assert len(data["translation"]) > 100
