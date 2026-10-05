"""Runs the real deep-research LangGraph pipeline with every network call faked."""

import asyncio
from types import SimpleNamespace

import pytest

import src.research.agents.graph as graph
from src.research.fetcher import is_blocked, is_title_blocked
from src.research.schemas import AnalysisResult, Competitor

RESULTS = {
    "forbes": {"url": "https://www.forbes.com/advisor/business/software/habit-apps/", "title": "Habit apps worth trying", "content": "FORBES-SNIPPET", "raw_content": "F" * 400},
    "medium": {"url": "https://medium.com/@dev/my-habit-app", "title": "I shipped a habit app in a weekend", "content": "MEDIUM-SNIPPET", "raw_content": ""},
    "ms": {"url": "https://www.microsoft.com/en-us/microsoft-365/microsoft-to-do-list-app", "title": "Microsoft To Do", "content": "MSTODO-SNIPPET", "raw_content": "M" * 600},
    "habitica": {"url": "https://habitica.com/", "title": "Habitica - Gamify Your Life", "content": "HABITICA-SNIPPET", "raw_content": "H" * 800},
    "listicle": {"url": "https://todoist.com/inspiration/best-habit-tracker-apps", "title": "9 Best Habit Tracker Apps", "content": "LISTICLE-SNIPPET", "raw_content": "L" * 400},
    "reddit": {"url": "https://www.reddit.com/r/getdisciplined/comments/abc/accountability_app/", "title": "Is there an app where friends see my habits?", "content": "REDDIT-SNIPPET", "raw_content": ""},
    "reddit2": {"url": "https://www.reddit.com/r/getdisciplined/comments/abc/accountability_app", "title": "Is there an app where friends see my habits?", "content": "REDDIT-SNIPPET", "raw_content": ""},
    "gh": {"url": "https://github.com/iSoron/uhabits", "title": "Loop Habit Tracker", "content": "GH-SNIPPET", "raw_content": "G" * 300},
    "ph": {"url": "https://www.producthunt.com/products/streaks", "title": "Streaks | Product Hunt", "content": "PH-SNIPPET", "raw_content": ""},
    "hn": {"url": "https://news.ycombinator.com/item?id=4242", "title": "Show HN: A habit tracker you share with one friend", "content": "HN-SNIPPET", "raw_content": ""},
    "zapier": {"url": "https://zapier.com/blog/best-habit-tracker-app/", "title": "The 7 best habit tracker apps in 2025", "content": "ZAPIER-SNIPPET", "raw_content": ""},
}


async def _fake_tavily(query, api_key, depth="advanced", max_results=5, include_raw=True, chunks=0, time_range=None):
    q = query.lower()
    if q.startswith("site:producthunt.com") or "site:producthunt.com" in q:
        return [RESULTS["ph"]]
    if "app alternative" in q:
        return [RESULTS[k] for k in ("forbes", "ms", "habitica", "listicle", "reddit")]
    if "site:github.com" in q or "open source tool" in q:
        return [RESULTS["gh"]]
    if "indie hacker" in q:
        return [RESULTS[k] for k in ("hn", "reddit2", "medium")]
    if "startup competitor" in q:
        return [RESULTS[k] for k in ("habitica", "zapier", "forbes")]
    return []


async def _fake_readmes(urls, max_repos=8):
    return {"iSoron/uhabits": "# Loop Habit Tracker\n" + "Loop is a mobile app for long-term positive habits. " * 10}


@pytest.fixture
def run_pipeline(monkeypatch):
    captured = {"deep_fetch_urls": None, "messages": None, "parsed": AnalysisResult(verdict="stub")}

    async def fake_deep_fetch(urls, max_pages=8, race_target=5):
        captured["deep_fetch_urls"] = list(urls)
        return {}

    class _Create:
        async def create(self, **kw):
            msg = SimpleNamespace(content="habit tracker with friends")
            return SimpleNamespace(choices=[SimpleNamespace(message=msg)])

    class _Parse:
        async def parse(self, **kw):
            captured["messages"] = kw["messages"]
            msg = SimpleNamespace(refusal=None, parsed=captured["parsed"])
            return SimpleNamespace(usage=None, choices=[SimpleNamespace(message=msg)])

    class FakeClient:
        def __init__(self, **kw):
            self.chat = SimpleNamespace(completions=_Create())
            self.beta = SimpleNamespace(chat=SimpleNamespace(completions=_Parse()))

    monkeypatch.setattr(graph, "_tavily_search", _fake_tavily)
    monkeypatch.setattr(graph, "fetch_github_readmes", _fake_readmes)
    monkeypatch.setattr(graph, "deep_fetch_pages", fake_deep_fetch)
    monkeypatch.setattr(graph, "AsyncOpenAI", FakeClient)
    monkeypatch.setattr(graph, "_log", lambda *_: None)

    settings = SimpleNamespace(tavily_api_key="fake", github_token="", openai_api_key="fake")

    def run(parsed=None):
        if parsed is not None:
            captured["parsed"] = parsed

        async def collect():
            return [ev async for ev in graph.run_deep_research(
                "I want to build a habit tracker app that you share with your friends", None, settings)]
        events = asyncio.run(collect())
        context = captured["messages"][1]["content"]
        return events, context, captured

    return run


def test_first_event_is_starting_progress(run_pipeline):
    events, _, _ = run_pipeline()
    assert events[0] == ("progress", {"message": "Starting deep research...", "pct": 3})
    assert events[-1][0] == "done"


def test_strategist_context_has_no_blocked_or_duplicate_sources(run_pipeline):
    _, context, _ = run_pipeline()

    for key, r in RESULTS.items():
        present = r["url"].rstrip("/") in context or r["content"] in context
        if is_blocked(r["url"]) or is_title_blocked(r["title"]):
            assert not present, f"{key} should not reach the prompt"

    # Quality results still make it through.
    assert "habitica.com" in context
    assert "news.ycombinator.com/item?id=4242" in context

    urls = {r["url"].rstrip("/") for r in RESULTS.values()}
    for url in urls:
        assert context.count(url) <= 1, f"{url} appears more than once"


def test_deep_fetch_receives_no_duplicates(run_pipeline):
    _, _, captured = run_pipeline()
    urls = captured["deep_fetch_urls"]
    assert urls, "deep fetch should be asked for the snippet-only pages"
    normalized = [u.lower().rstrip("/") for u in urls]
    assert len(normalized) == len(set(normalized))
    assert not any(is_blocked(u) for u in urls)


def test_report_counts_filtered_sources_and_drops_ungrounded_competitors(run_pipeline):
    parsed = AnalysisResult(verdict="stub", competitors=[
        Competitor(name="Habitica", url="https://habitica.com/", description="RPG habits"),
        Competitor(name="Loop Habit Tracker", url="https://github.com/iSoron/uhabits", description="Open source"),
        Competitor(name="Invented Inc", url="https://invented.example", description="Not in the data"),
    ])
    events, _, _ = run_pipeline(parsed)
    kind, payload = events[-1]
    assert kind == "done"
    report = payload["report"]
    assert [c["name"] for c in report["competitors"]] == ["Habitica", "Loop Habit Tracker"]
    # 11 distinct results: forbes and medium are blocked, and the two reddit
    # URLs differ only by a trailing slash, which leaves 8.
    assert report["sources_count"] == 8
