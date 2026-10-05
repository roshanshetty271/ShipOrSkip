import asyncio
from types import SimpleNamespace

import httpx
import pytest
from openai import RateLimitError

import src.research.service as service
from src.research.schemas import AnalysisResult, Competitor

SETTINGS = SimpleNamespace(openai_api_key="fake", tavily_api_key="fake")


def _install(monkeypatch, results, outcome):
    captured = {}

    async def fake_tavily(query, settings, **_opts):
        return list(results)

    class _Parse:
        async def parse(self, **kw):
            captured["messages"] = kw["messages"]
            if isinstance(outcome, Exception):
                raise outcome
            return SimpleNamespace(usage=None, choices=[SimpleNamespace(message=outcome)])

    class FakeClient:
        def __init__(self, **_kw):
            self.beta = SimpleNamespace(chat=SimpleNamespace(completions=_Parse()))

    monkeypatch.setattr(service, "_tavily_search", fake_tavily)
    monkeypatch.setattr(service, "AsyncOpenAI", FakeClient)
    monkeypatch.setattr(service, "_log", lambda *_: None)
    return captured


def _run(idea="habit tracker"):
    return asyncio.run(service.fast_analysis(idea, None, SETTINGS))


ONE_RESULT = [{"url": "https://habitica.com/", "title": "Habitica", "content": "Gamified habits", "raw_content": ""}]


def test_thin_coverage_is_disclosed_and_sources_counted(monkeypatch):
    parsed = AnalysisResult(verdict="ok", competitors=[
        Competitor(name="Habitica", url="https://habitica.com/", description="RPG habits"),
        Competitor(name="Made Up App", url="https://made-up.example", description="not in data"),
    ])
    captured = _install(monkeypatch, ONE_RESULT, SimpleNamespace(refusal=None, parsed=parsed))

    result = _run()

    system = captured["messages"][0]["content"]
    assert "Say so briefly in the verdict" in system
    assert "never know" not in system
    assert result["sources_count"] == 1
    assert [c["name"] for c in result["competitors"]] == ["Habitica"]


def test_refusal_raises_analysis_error(monkeypatch):
    _install(monkeypatch, ONE_RESULT, SimpleNamespace(refusal="no", parsed=None))
    with pytest.raises(service.AnalysisError) as exc:
        _run()
    assert exc.value.status_code == 422


def test_provider_error_raises_analysis_error(monkeypatch):
    response = httpx.Response(429, request=httpx.Request("POST", "https://api.openai.com/v1/chat/completions"))
    _install(monkeypatch, ONE_RESULT, RateLimitError("busy", response=response, body=None))
    with pytest.raises(service.AnalysisError) as exc:
        _run()
    assert exc.value.status_code == 503
