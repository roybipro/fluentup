import asyncio

import httpx

from app.config import settings
from app.services import ai_service


def test_gemini_key_is_sent_in_header_not_url(monkeypatch):
    captured = {}

    async def fake_post(self, url, json=None, headers=None, **kwargs):
        captured["url"] = str(url)
        captured["headers"] = headers or {}
        request = httpx.Request("POST", url)
        body = {"candidates": [{"content": {"parts": [{"text": "{\"ok\": true}"}]}}]}
        return httpx.Response(200, json=body, request=request)

    monkeypatch.setattr(settings, "gemini_api_key", "test-gemini-key-123")
    monkeypatch.setattr(httpx.AsyncClient, "post", fake_post)

    result = asyncio.run(ai_service.call_gemini_json("system", "prompt"))

    assert result == {"ok": True}
    assert "test-gemini-key-123" not in captured["url"]
    assert "key=" not in captured["url"]
    assert captured["headers"].get("x-goog-api-key") == "test-gemini-key-123"


def test_natural_rewrite_leaves_questions_alone():
    from app.schemas import GrammarCheckRequest

    res = ai_service.deterministic_grammar_check(GrammarCheckRequest(text="Where do you live?", explanationLanguage="en"))
    assert not res.naturalRewrite.startswith("From my perspective")
    assert res.naturalRewrite.endswith("?")


def test_natural_rewrite_keeps_capital_i():
    from app.schemas import GrammarCheckRequest

    res = ai_service.deterministic_grammar_check(GrammarCheckRequest(text="I like tea.", explanationLanguage="en"))
    assert "From my perspective, i " not in res.naturalRewrite
