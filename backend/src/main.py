import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from src.config import get_settings, get_supabase_client
from src.middleware import setup_middleware
from src.research.router import router as research_router
from src.auth.router import router as auth_router
from src.auth.dependencies import close_http_client

settings = get_settings()
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    required = ["openai_api_key"]
    missing = [k for k in required if not getattr(settings, k)]
    if missing:
        logger.warning(f"Missing env vars: {missing}. Some features unavailable.")

    # Clean up any research stuck in "processing" from a previous crash
    sb = get_supabase_client()
    if sb:
        try:
            result = sb.rpc("cleanup_stuck_research").execute()
            cleaned = result.data if result.data else 0
            if cleaned:
                logger.info(f"Cleaned up {cleaned} stuck research record(s) on startup.")
        except Exception as e:
            logger.warning(f"Could not run stuck-research cleanup: {e}")

    yield

    await close_http_client()


app = FastAPI(
    title="ShipOrSkip API",
    version="2.0.0",
    docs_url="/docs" if settings.debug else None,
    lifespan=lifespan,
)

setup_middleware(app, settings.frontend_url)

app.include_router(research_router, prefix="/api")
app.include_router(auth_router, prefix="/api/auth")


@app.get("/")
async def root():
    """Root endpoint — used by UptimeRobot to keep HF Spaces alive."""
    return {"status": "alive", "service": "shiporskip-api"}


@app.get("/health")
async def health():
    return {"status": "healthy", "service": "shiporskip-api"}


@app.get("/health/detailed")
async def health_detailed():
    checks = {"api": "healthy"}
    if settings.openai_api_key:
        checks["openai"] = "configured"
    else:
        checks["openai"] = "missing"
    if settings.tavily_api_key:
        checks["tavily"] = "configured"
    else:
        checks["tavily"] = "missing"
    overall = "healthy" if all(v != "missing" for v in checks.values()) else "degraded"
    return {"status": overall, "checks": checks}