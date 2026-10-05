from src.config import Settings

USER = {"id": "user-1", "email": "builder@example.com"}


def test_pdf_failure_returns_generic_message(api, monkeypatch):
    api.state.user = USER
    api.db.tables["research"] = [{"id": "r-1", "user_id": USER["id"], "status": "completed", "result": {}}]

    def broken(_research):
        raise ValueError("secret internal detail")
    monkeypatch.setattr(api.router, "generate_research_pdf", broken)

    resp = api.client.get("/api/research/r-1/export/pdf")

    assert resp.status_code == 500
    assert resp.json()["detail"] == "Could not generate PDF. Please try again."


def test_settings_ignore_unknown_env_file_keys(tmp_path):
    env = tmp_path / ".env"
    env.write_text("PRODUCTHUNT_TOKEN=old\nOPENAI_API_KEY=from-file\n")
    assert Settings(_env_file=env).openai_api_key == "from-file"
