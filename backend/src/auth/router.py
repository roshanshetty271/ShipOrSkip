from fastapi import APIRouter, Depends
from src.auth.dependencies import get_current_user, require_auth
from src.auth.schemas import UserProfile
from src.config import get_settings, get_supabase_client, Settings
from typing import Optional

router = APIRouter()


@router.get("/me")
async def get_me(user: Optional[dict] = Depends(get_current_user)):
    """Get current user profile. Returns null user if not authenticated."""
    if user is None:
        return {"user": None}

    # Fetch profile from Supabase
    sb = get_supabase_client()
    if sb:
        try:
            result = sb.table("profiles").select("*").eq("id", user["id"]).single().execute()
            if result.data:
                return {"user": {
                    "id": result.data["id"],
                    "email": user.get("email"),
                    "display_name": result.data.get("display_name"),
                    "tier": result.data.get("tier", "free"),
                    "deep_research_count": result.data.get("deep_research_count", 0),
                }}
        except Exception:
            pass

    return {"user": {"id": user["id"], "email": user.get("email"), "tier": "free"}}
