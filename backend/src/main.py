import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from src.config import get_settings
from src.research.router import router as research_router
from src.auth.router import router as auth_router

settings = get_settings()
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: validate required env vars
    required = ["openai_api_key", "tavily_api_key"]
    missing = [k for k in required if not getattr(settings, k)]
    if missing:
        logger.warning(f"Missing env vars: {missing}. Some features will be unavailable.")
    yield
    # Shutdown: cleanup if needed


app = FastAPI(
    title="ShipOrSkip API",
    version="1.0.0",
    docs_url="/docs" if settings.debug else None,
    lifespan=lifespan,
)

# --- Middleware ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url, "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)
app.add_middleware(GZipMiddleware, minimum_size=1000)

# --- Security headers ---
@app.middleware("http")
async def security_headers(request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    return response

# --- Routes ---
app.include_router(research_router, prefix="/api")
app.include_router(auth_router, prefix="/api/auth")

@app.get("/health")
async def health():
    return {"status": "healthy", "service": "shiporskip-api"}
