from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # API Keys
    openai_api_key: str = ""
    tavily_api_key: str = ""
    supabase_url: str = ""
    supabase_service_key: str = ""
    github_token: str = ""
    producthunt_token: str = ""
    turnstile_secret_key: str = ""

    # App
    frontend_url: str = "http://localhost:3000"
    debug: bool = False

    class Config:
        env_file = ".env"


@lru_cache
def get_settings() -> Settings:
    return Settings()


def get_supabase_client():
    """Get Supabase admin client (service role, bypasses RLS)."""
    from supabase import create_client
    s = get_settings()
    if not s.supabase_url or not s.supabase_service_key:
        return None
    return create_client(s.supabase_url, s.supabase_service_key)
