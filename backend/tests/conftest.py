"""Shared fakes. Nothing here talks to Supabase, OpenAI, Tavily or GitHub."""

import itertools
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest


class FakeQuery:
    def __init__(self, db: "FakeSupabase", table: str):
        self.db = db
        self.table = table
        self.op = "select"
        self.payload = None
        self.filters = []
        self.order_by = None
        self.row_limit = None
        self.is_single = False

    # ── builders ──
    def select(self, *_cols, count=None):
        self.op = "select"
        return self

    def insert(self, payload):
        self.op, self.payload = "insert", payload
        return self

    def update(self, payload):
        self.op, self.payload = "update", payload
        return self

    def delete(self):
        self.op = "delete"
        return self

    def eq(self, col, val):
        self.filters.append(lambda r: r.get(col) == val)
        return self

    def neq(self, col, val):
        self.filters.append(lambda r: r.get(col) is not None and r.get(col) != val)
        return self

    def gte(self, col, val):
        self.filters.append(lambda r: r.get(col) is not None and r.get(col) >= val)
        return self

    def order(self, col, desc=False):
        self.order_by = (col, desc)
        return self

    def limit(self, n):
        self.row_limit = n
        return self

    def single(self):
        self.is_single = True
        return self

    # ── execution ──
    def _matches(self):
        return [r for r in self.db.tables.setdefault(self.table, []) if all(f(r) for f in self.filters)]

    def execute(self):
        err = self.db.errors.get((self.table, self.op))
        if err is not None:
            raise err
        rows = self.db.tables.setdefault(self.table, [])
        if self.op == "insert":
            items = self.payload if isinstance(self.payload, list) else [self.payload]
            inserted = []
            for item in items:
                row = {"id": f"row-{next(self.db.ids)}", "status": "completed",
                       "created_at": datetime.now(timezone.utc).isoformat(), **item}
                rows.append(row)
                inserted.append(dict(row))
            return SimpleNamespace(data=inserted, count=len(inserted))
        if self.op == "update":
            matched = self._matches()
            for r in matched:
                r.update(self.payload)
            return SimpleNamespace(data=[dict(r) for r in matched], count=len(matched))
        if self.op == "delete":
            matched = self._matches()
            self.db.tables[self.table] = [r for r in rows if r not in matched]
            return SimpleNamespace(data=matched, count=len(matched))
        matched = self._matches()
        if self.order_by:
            col, desc = self.order_by
            matched = sorted(matched, key=lambda r: r.get(col) or "", reverse=desc)
        if self.row_limit is not None:
            matched = matched[: self.row_limit]
        data = [dict(r) for r in matched]
        if self.is_single:
            data = data[0] if data else None
        return SimpleNamespace(data=data, count=len(matched))


class FakeSupabase:
    def __init__(self):
        self.tables: dict[str, list[dict]] = {}
        self.errors: dict[tuple[str, str], Exception] = {}
        self.ids = itertools.count(1)

    def table(self, name):
        return FakeQuery(self, name)

    def rpc(self, _name, *_args, **_kwargs):
        return SimpleNamespace(execute=lambda: SimpleNamespace(data=0))


@pytest.fixture
def api(monkeypatch):
    """TestClient for the real app with auth, settings and Supabase stubbed."""
    from fastapi.testclient import TestClient

    import src.research.router as router
    from src.auth.dependencies import get_current_user
    from src.config import Settings, get_settings
    from src.main import app
    from src.middleware import limiter

    db = FakeSupabase()
    settings = Settings(_env_file=None, openai_api_key="test-key", turnstile_secret_key="")
    state = SimpleNamespace(user=None)

    monkeypatch.setattr(router, "get_supabase_client", lambda: db)
    monkeypatch.setattr(limiter, "enabled", False)
    app.dependency_overrides[get_settings] = lambda: settings
    app.dependency_overrides[get_current_user] = lambda: state.user

    yield SimpleNamespace(client=TestClient(app), db=db, state=state, router=router, settings=settings)

    app.dependency_overrides.clear()

