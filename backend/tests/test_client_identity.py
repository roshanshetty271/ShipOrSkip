import asyncio
import hashlib
import hmac
import time
from types import SimpleNamespace

import pytest

from src.client_ip import get_client_ip
from src.config import Settings
from src.middleware import limiter

IDEA = {"idea": "habit tracker you share with friends"}


def _request(headers=None, host="10.0.0.1"):
    return SimpleNamespace(headers=headers or {}, client=SimpleNamespace(host=host))


def test_client_ip_prefers_first_forwarded_entry():
    assert get_client_ip(_request({"x-forwarded-for": "203.0.113.7, 10.0.0.2"})) == "203.0.113.7"
    assert get_client_ip(_request()) == "10.0.0.1"


def test_rate_limiter_buckets_by_forwarded_ip(api, monkeypatch):
    async def ok(*_a, **_k):
        return {"verdict": "ok", "competitors": [], "raw_sources": []}

    async def no_limit(*_a, **_k):
        return None

    monkeypatch.setattr(api.router, "fast_analysis", ok)
    monkeypatch.setattr(api.router, "_check_signed_in_fast_limit", no_limit)
    monkeypatch.setattr(limiter, "enabled", True)
    limiter.reset()
    api.state.user = {"id": "user-1", "email": "builder@example.com"}

    first = {"x-forwarded-for": "198.51.100.1"}
    codes = [api.client.post("/api/analyze/fast", json=IDEA, headers=first).status_code for _ in range(11)]
    assert codes[:10] == [200] * 10
    assert codes[10] == 429

    other = {"x-forwarded-for": "198.51.100.2"}
    assert api.client.post("/api/analyze/fast", json=IDEA, headers=other).status_code == 200
    limiter.reset()


def test_ip_hash_uses_hmac_with_configured_salt(api, monkeypatch):
    monkeypatch.setattr(api.router, "get_settings", lambda: Settings(_env_file=None, ip_hash_salt="pepper"))
    expected = hmac.new(b"pepper", b"203.0.113.7", hashlib.sha256).hexdigest()
    assert api.router._hash_ip("203.0.113.7") == expected
    assert expected != hashlib.sha256(b"203.0.113.7").hexdigest()


def test_ip_hash_falls_back_to_service_key(api, monkeypatch):
    monkeypatch.setattr(api.router, "get_settings", lambda: Settings(_env_file=None, supabase_service_key="key-a"))
    a = api.router._hash_ip("203.0.113.7")
    assert a == api.router._hash_ip("203.0.113.7")
    monkeypatch.setattr(api.router, "get_settings", lambda: Settings(_env_file=None, supabase_service_key="key-b"))
    assert api.router._hash_ip("203.0.113.7") != a


def test_anonymous_analyze_fails_closed_when_usage_read_errors(api, monkeypatch):
    calls = []

    async def ok(*_a, **_k):
        calls.append(True)
        return {"verdict": "ok", "competitors": [], "raw_sources": []}
    monkeypatch.setattr(api.router, "fast_analysis", ok)
    api.db.errors[("anon_usage", "select")] = RuntimeError("supabase down")

    resp = api.client.post("/api/analyze/fast", json=IDEA)
    assert resp.status_code == 503
    assert resp.json()["detail"] == "Usage check is unavailable, try again shortly."
    assert calls == []

    limits = api.client.get("/api/limits")
    assert limits.status_code == 200
    assert limits.json()["remaining_fast"] == 2


def test_anonymous_analyze_works_without_supabase(api, monkeypatch):
    async def ok(*_a, **_k):
        return {"verdict": "ok", "competitors": [], "raw_sources": []}
    monkeypatch.setattr(api.router, "fast_analysis", ok)
    monkeypatch.setattr(api.router, "get_supabase_client", lambda: None)

    assert api.client.post("/api/analyze/fast", json=IDEA).status_code == 200


def test_verified_ips_expire_and_are_pruned(api, monkeypatch):
    async def valid(_token, _secret):
        return True
    monkeypatch.setattr(api.router, "verify_turnstile", valid)
    monkeypatch.setattr(api.router, "_verified_ips", {"192.0.2.1": time.monotonic() - 1})
    settings = Settings(_env_file=None, turnstile_secret_key="live-secret")
    req = _request({"x-forwarded-for": "192.0.2.9"})

    asyncio.run(api.router._check_turnstile(req, "token", settings))

    assert set(api.router._verified_ips) == {"192.0.2.9"}
    expiry = api.router._verified_ips["192.0.2.9"]
    assert expiry - time.monotonic() == pytest.approx(api.router.TURNSTILE_PASS_TTL_SECONDS, abs=5)

    # A cached pass skips the token check until it expires.
    asyncio.run(api.router._check_turnstile(req, None, settings))
    api.router._verified_ips["192.0.2.9"] = time.monotonic() - 1
    with pytest.raises(Exception) as exc:
        asyncio.run(api.router._check_turnstile(req, None, settings))
    assert exc.value.status_code == 400
