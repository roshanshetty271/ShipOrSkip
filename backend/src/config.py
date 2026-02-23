from pydantic_settings import BaseSettings
from functools import lru_cache
import logging

logger = logging.getLogger(__name__)


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


_supabase_client = None
_supabase_attempted = False


def get_supabase_client():
    """Get Supabase admin client. Returns None if not configured or keys are invalid."""
    global _supabase_client, _supabase_attempted

    if _supabase_attempted:
        return _supabase_client

    _supabase_attempted = True
    s = get_settings()

    if not s.supabase_url or not s.supabase_service_key:
        logger.warning("Supabase URL or service key not configured. DB features disabled.")
        return None

    try:
        from supabase import create_client
        _supabase_client = create_client(s.supabase_url, s.supabase_service_key)
        logger.info("Supabase client initialized successfully.")
        return _supabase_client
    except Exception as e:
        logger.error(
            f"Failed to initialize Supabase client: {e}. "
            "DB features (history, auth, limits) will be disabled. "
            "Check that SUPABASE_URL and SUPABASE_SERVICE_KEY are correct. "
            "If using new-format keys (sb_secret_...), try the legacy keys from Settings → API → Legacy keys."
        )
        return None