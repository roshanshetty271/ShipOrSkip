from datetime import datetime, timedelta, timezone

import pytest

from src.research.service import AnalysisError

USER = {"id": "user-1", "email": "builder@example.com"}
IDEA = {"idea": "habit tracker you share with friends"}


def _ok_result():
    return {"verdict": "Build it.", "competitors": [], "pros": [], "cons": [],
            "gaps": [], "build_plan": [], "market_saturation": "low", "raw_sources": []}


@pytest.mark.parametrize("status_code", [503, 422])
def test_failed_fast_run_for_anonymous_is_not_counted(api, monkeypatch, status_code):
    async def failing(*_a, **_k):
        raise AnalysisError("AI service is busy. Wait a moment and try again.", status_code)
    monkeypatch.setattr(api.router, "fast_analysis", failing)

    resp = api.client.post("/api/analyze/fast", json=IDEA)

    assert resp.status_code == status_code
    assert resp.json()["detail"] == "AI service is busy. Wait a moment and try again."
    assert api.db.tables.get("anon_usage", []) == []


def test_failed_fast_run_for_signed_in_user_is_not_saved(api, monkeypatch):
    api.state.user = USER

    async def failing(*_a, **_k):
        raise AnalysisError("Could not analyze. Try rephrasing.", 422)
    monkeypatch.setattr(api.router, "fast_analysis", failing)

    resp = api.client.post("/api/analyze/fast", json=IDEA)

    assert resp.status_code == 422
    assert api.db.tables.get("research", []) == []


def test_successful_fast_runs_are_counted(api, monkeypatch):
    async def ok(*_a, **_k):
        return _ok_result()
    monkeypatch.setattr(api.router, "fast_analysis", ok)

    assert api.client.post("/api/analyze/fast", json=IDEA).status_code == 200
    assert api.db.tables["anon_usage"][0]["fast_count"] == 1

    api.state.user = USER
    resp = api.client.post("/api/analyze/fast", json=IDEA)
    assert resp.status_code == 200
    assert [r["status"] for r in api.db.tables["research"]] == ["completed"]
    assert resp.json()["limits"]["remaining_fast"] == 2


def test_rolling_usage_ignores_failed_runs(api):
    recent = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    api.db.tables["research"] = [
        {"id": "a", "user_id": USER["id"], "analysis_type": "deep", "status": "failed", "created_at": recent},
        {"id": "b", "user_id": USER["id"], "analysis_type": "deep", "status": "failed", "created_at": recent},
    ]
    assert api.router._get_rolling_usage(USER["id"], "deep", 1)["remaining"] == 1

    api.db.tables["research"].append(
        {"id": "c", "user_id": USER["id"], "analysis_type": "deep", "status": "processing", "created_at": recent})
    usage = api.router._get_rolling_usage(USER["id"], "deep", 1)
    assert usage["used"] == 1
    assert usage["remaining"] == 0


def test_deep_stream_saves_completed_run(api, monkeypatch):
    api.state.user = USER

    async def fake_stream(*_a, **_k):
        yield ("progress", {"message": "Starting deep research...", "pct": 3})
        yield ("done", {"report": _ok_result()})
    monkeypatch.setattr(api.router, "deep_research_stream", fake_stream)

    resp = api.client.post("/api/analyze/deep", json=IDEA)

    assert resp.status_code == 200
    assert "event: done" in resp.text
    assert [r["status"] for r in api.db.tables["research"]] == ["completed"]
    assert api.db.tables.get("anon_usage", []) == []
