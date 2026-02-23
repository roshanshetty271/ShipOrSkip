from fastapi import Depends, HTTPException, Header
from typing import Optional
import logging
import httpx

from src.config import get_settings, Settings

logger = logging.getLogger(__name__)


async def get_current_user(
    authorization: Optional[str] = Header(None),
    settings: Settings = Depends(get_settings),
) -> Optional[dict]:
    """Extract and verify Supabase JWT from Authorization header.
    Returns user dict or None for anonymous requests."""
    if not authorization or not authorization.startswith("Bearer "):
        return None

    token = authorization.split(" ", 1)[1]
    if not settings.supabase_url:
        return None

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(
                f"{settings.supabase_url}/auth/v1/user",
                headers={
                    "Authorization": f"Bearer {token}",
                    "apikey": settings.supabase_service_key,
                },
            )
            if resp.status_code == 200:
                return resp.json()
            elif resp.status_code == 401:
                return None  # Expired/invalid token — treat as anonymous
            else:
                logger.warning(f"Supabase auth returned {resp.status_code}: {resp.text[:200]}")
                return None
    except httpx.ConnectError:
        logger.error("Cannot connect to Supabase — project may be paused or URL is wrong")
        raise HTTPException(
            status_code=503,
            detail="Authentication service is temporarily unavailable. Please try again later."
        )
    except httpx.TimeoutException:
        logger.error("Supabase auth request timed out")
        raise HTTPException(
            status_code=503,
            detail="Authentication service timed out. Please try again."
        )
    except Exception as e:
        logger.error(f"Unexpected auth error: {e}")
        return None


async def require_auth(
    user: Optional[dict] = Depends(get_current_user),
) -> dict:
    """Require authenticated user — raises 401 if not logged in."""
    if user is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    return user