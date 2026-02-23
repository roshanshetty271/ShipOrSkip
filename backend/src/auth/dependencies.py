from fastapi import Depends, HTTPException, Header
from typing import Optional
import httpx

from src.config import get_settings, Settings


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
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{settings.supabase_url}/auth/v1/user",
                headers={"Authorization": f"Bearer {token}", "apikey": settings.supabase_service_key},
                timeout=5.0,
            )
            if resp.status_code == 200:
                return resp.json()
    except Exception:
        pass
    return None


async def require_auth(
    user: Optional[dict] = Depends(get_current_user),
) -> dict:
    """Require authenticated user — raises 401 if not logged in."""
    if user is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    return user
