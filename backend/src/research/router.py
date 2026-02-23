import json
import logging
from datetime import date
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse

from src.middleware import limiter
from src.research.schemas import AnalyzeRequest
from src.research.service import fast_analysis, deep_research_stream
from src.auth.dependencies import get_current_user, require_auth
from src.auth.service import verify_turnstile
from src.config import get_settings, get_supabase_client, Settings

logger = logging.getLogger(__name__)
router = APIRouter()


async def _check_turnstile(token: Optional[str], settings: Settings):
    """Verify Turnstile token if configured."""
    if settings.turnstile_secret_key and settings.turnstile_secret_key != "1x0000000000000000000000000000000AA":
        if not token:
            raise HTTPException(status_code=400, detail="Bot verification required")
        valid = await verify_turnstile(token, settings.turnstile_secret_key)
        if not valid:
            raise HTTPException(status_code=403, detail="Bot verification failed")


async def _check_deep_limit(user: Optional[dict], settings: Settings):
    """Enforce daily deep research limits."""
    sb = get_supabase_client()
    if not sb or not user:
        return  # Anonymous gets 2/day tracked by IP (via slowapi)

    uid = user["id"]
    try:
        profile = sb.table("profiles").select("deep_research_count, last_reset_date, tier").eq("id", uid).single().execute()
        if not profile.data:
            return

        data = profile.data
        today = date.today().isoformat()

        # Reset counter if new day
        if data.get("last_reset_date") != today:
            sb.table("profiles").update({"deep_research_count": 0, "last_reset_date": today}).eq("id", uid).execute()
            return

        limit = 20 if data.get("tier") == "premium" else 4
        if data.get("deep_research_count", 0) >= limit:
            raise HTTPException(status_code=429, detail=f"Daily deep research limit reached ({limit}/day)")
    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"Could not check deep limit: {e}")


async def _save_research(user: Optional[dict], idea: str, category: Optional[str], analysis_type: str, result: dict):
    """Persist research result to Supabase."""
    sb = get_supabase_client()
    if not sb or not user:
        return None

    try:
        record = sb.table("research").insert({
            "user_id": user["id"],
            "idea_text": idea,
            "category": category,
            "analysis_type": analysis_type,
            "result": result,
            "status": "completed",
        }).execute()
        return record.data[0]["id"] if record.data else None
    except Exception as e:
        logger.warning(f"Could not save research: {e}")
        return None


async def _increment_deep_count(user: Optional[dict]):
    """Increment daily deep research counter."""
    sb = get_supabase_client()
    if not sb or not user:
        return
    try:
        sb.rpc("increment_deep_count", {"user_id_input": user["id"]}).execute()
    except Exception:
        # Fallback: direct update
        try:
            profile = sb.table("profiles").select("deep_research_count").eq("id", user["id"]).single().execute()
            current = profile.data.get("deep_research_count", 0) if profile.data else 0
            sb.table("profiles").update({"deep_research_count": current + 1}).eq("id", user["id"]).execute()
        except Exception as e:
            logger.warning(f"Could not increment deep count: {e}")


@router.post("/analyze/fast")
@limiter.limit("10/minute")
async def analyze_fast(
    request: Request,
    req: AnalyzeRequest,
    settings: Settings = Depends(get_settings),
    user: dict = Depends(require_auth),
):
    if not settings.openai_api_key:
        raise HTTPException(status_code=503, detail="OpenAI API key not configured")

    await _check_turnstile(req.turnstile_token, settings)

    try:
        result = await fast_analysis(req.idea, req.category, settings)
        await _save_research(user, req.idea, req.category, "fast", result)
        return result
    except Exception as e:
        logger.exception("Fast analysis failed")
        raise HTTPException(status_code=500, detail="Analysis failed. Please try again.")


@router.post("/analyze/deep")
@limiter.limit("3/minute")
async def analyze_deep(
    request: Request,
    req: AnalyzeRequest,
    settings: Settings = Depends(get_settings),
    user: dict = Depends(require_auth),
):
    if not settings.openai_api_key:
        raise HTTPException(status_code=503, detail="OpenAI API key not configured")

    await _check_turnstile(req.turnstile_token, settings)
    await _check_deep_limit(user, settings)

    final_result = {}

    async def event_stream():
        nonlocal final_result
        try:
            async for event_type, data in deep_research_stream(req.idea, req.category, settings):
                if event_type == "done":
                    final_result = data.get("report", data)
                yield f"event: {event_type}\ndata: {json.dumps(data)}\n\n"
        except Exception as e:
            logger.exception("Deep research stream failed")
            yield f'event: error\ndata: {json.dumps({"message": "Research failed. Please try again."})}\n\n'
        finally:
            # Save result + increment counter after stream completes
            if final_result:
                await _save_research(user, req.idea, req.category, "deep", final_result)
                await _increment_deep_count(user)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/research")
async def get_research_history(
    user: dict = Depends(get_current_user),
):
    """Get user's research history."""
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")

    sb = get_supabase_client()
    if not sb:
        return {"research": []}

    try:
        result = sb.table("research") \
            .select("id, idea_text, category, analysis_type, status, created_at") \
            .eq("user_id", user["id"]) \
            .order("created_at", desc=True) \
            .limit(50) \
            .execute()
        return {"research": result.data or []}
    except Exception as e:
        logger.warning(f"Could not fetch research history: {e}")
        return {"research": []}


@router.get("/research/{research_id}")
async def get_research_detail(
    research_id: UUID,
    user: dict = Depends(get_current_user),
):
    """Get a specific research result."""
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")

    sb = get_supabase_client()
    if not sb:
        raise HTTPException(status_code=503, detail="Database not configured")

    try:
        result = sb.table("research") \
            .select("*") \
            .eq("id", research_id) \
            .eq("user_id", user["id"]) \
            .single() \
            .execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Research not found")
        return result.data
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Could not fetch research")
