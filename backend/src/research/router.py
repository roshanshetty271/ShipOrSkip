"""
ShipOrSkip Research Router

Rate limits:
  Per-minute (slowapi):    10/min fast, 3/min deep
  Anonymous (IP tracked):  3 fast total, 1 deep total
  Signed-in Free (daily):  10 fast/day, 3 deep/day, 4 deep researches/day (DB)
  Signed-in Premium:       unlimited
  Chat: 5 messages/research (free tier)

All analysis endpoints return remaining counts in response.
GET /api/limits returns current remaining for frontend display.
"""

import json
import logging
from collections import defaultdict
from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse, Response

from src.middleware import limiter
from src.research.schemas import AnalyzeRequest
from pydantic import BaseModel, Field
from src.research.service import fast_analysis, deep_research_stream
from src.research.chat_service import chat_with_research
from src.research.pdf_service import generate_research_pdf
from src.auth.dependencies import get_current_user, require_auth
from src.auth.service import verify_turnstile
from src.config import get_settings, get_supabase_client, Settings

logger = logging.getLogger(__name__)
router = APIRouter()

_TURNSTILE_TEST_KEYS = {"", "1x0000000000000000000000000000000AA", "1x00000000000000000000AA"}

# ═══════════════════════════════════════
# Limits
# ═══════════════════════════════════════

ANON_FAST_LIMIT = 3
ANON_DEEP_LIMIT = 1
FREE_FAST_DAILY = 10
FREE_DEEP_DAILY = 3

# ═══════════════════════════════════════
# Anonymous IP tracking (in-memory)
# ═══════════════════════════════════════

_anon_usage: dict[str, dict] = defaultdict(lambda: {"fast": 0, "deep": 0})


def _get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


# ═══════════════════════════════════════
# Remaining count helpers
# ═══════════════════════════════════════

def _get_anon_remaining(request: Request) -> dict:
    ip = _get_client_ip(request)
    usage = _anon_usage[ip]
    return {
        "remaining_fast": max(0, ANON_FAST_LIMIT - usage["fast"]),
        "remaining_deep": max(0, ANON_DEEP_LIMIT - usage["deep"]),
        "tier": "anonymous",
        "fast_limit": ANON_FAST_LIMIT,
        "deep_limit": ANON_DEEP_LIMIT,
    }


async def _get_signed_in_remaining(user: dict) -> dict:
    sb = get_supabase_client()
    if not sb:
        return {"remaining_fast": FREE_FAST_DAILY, "remaining_deep": FREE_DEEP_DAILY, "tier": "free",
                "fast_limit": FREE_FAST_DAILY, "deep_limit": FREE_DEEP_DAILY}
    try:
        profile = sb.table("profiles").select("tier, deep_research_count, last_reset_date").eq("id", user["id"]).execute()
        if not profile.data or len(profile.data) == 0:
            return {"remaining_fast": FREE_FAST_DAILY, "remaining_deep": FREE_DEEP_DAILY, "tier": "free",
                    "fast_limit": FREE_FAST_DAILY, "deep_limit": FREE_DEEP_DAILY}

        data = profile.data[0]
        tier = data.get("tier", "free")

        if tier == "premium":
            return {"remaining_fast": "unlimited", "remaining_deep": "unlimited", "tier": "premium",
                    "fast_limit": "unlimited", "deep_limit": "unlimited"}

        today = date.today().isoformat()
        deep_used = data.get("deep_research_count", 0)
        if data.get("last_reset_date") != today:
            deep_used = 0

        # Count today's fast analyses
        fast_used = 0
        try:
            today_start = f"{today}T00:00:00"
            fast_result = sb.table("research").select("id", count="exact") \
                .eq("user_id", user["id"]).eq("analysis_type", "fast") \
                .gte("created_at", today_start).execute()
            fast_used = fast_result.count or 0
        except Exception:
            pass

        return {
            "remaining_fast": max(0, FREE_FAST_DAILY - fast_used),
            "remaining_deep": max(0, FREE_DEEP_DAILY - deep_used),
            "tier": "free",
            "fast_limit": FREE_FAST_DAILY,
            "deep_limit": FREE_DEEP_DAILY,
        }
    except Exception as e:
        logger.warning(f"Could not get remaining: {e}")
        return {"remaining_fast": FREE_FAST_DAILY, "remaining_deep": FREE_DEEP_DAILY, "tier": "free",
                "fast_limit": FREE_FAST_DAILY, "deep_limit": FREE_DEEP_DAILY}


# ═══════════════════════════════════════
# Common checks
# ═══════════════════════════════════════

async def _check_turnstile(token: Optional[str], settings: Settings):
    secret = settings.turnstile_secret_key.strip()
    if not secret or secret in _TURNSTILE_TEST_KEYS:
        return
    if not token:
        raise HTTPException(status_code=400, detail="Bot verification required")
    valid = await verify_turnstile(token, secret)
    if not valid:
        raise HTTPException(status_code=403, detail="Bot verification failed")


def _check_anon_limit(request: Request, analysis_type: str):
    """Check anonymous usage. Raises 429 if over limit."""
    ip = _get_client_ip(request)
    usage = _anon_usage[ip]
    remaining = _get_anon_remaining(request)

    if analysis_type == "fast" and usage["fast"] >= ANON_FAST_LIMIT:
        raise HTTPException(status_code=429, detail={
            "message": f"You've used all {ANON_FAST_LIMIT} free fast analyses. Sign in to get {FREE_FAST_DAILY} per day.",
            "sign_in_required": True, **remaining,
        })
    if analysis_type == "deep" and usage["deep"] >= ANON_DEEP_LIMIT:
        raise HTTPException(status_code=429, detail={
            "message": f"You've used your {ANON_DEEP_LIMIT} free deep research. Sign in to get {FREE_DEEP_DAILY} per day.",
            "sign_in_required": True, **remaining,
        })


def _increment_anon(request: Request, analysis_type: str):
    ip = _get_client_ip(request)
    _anon_usage[ip][analysis_type] += 1


async def _check_signed_in_fast_limit(user: dict):
    """Check signed-in user's daily fast limit."""
    remaining = await _get_signed_in_remaining(user)
    if remaining.get("tier") == "premium":
        return
    if remaining["remaining_fast"] <= 0:
        raise HTTPException(status_code=429, detail={
            "message": f"You've used all {FREE_FAST_DAILY} fast analyses for today. Resets tomorrow.",
            **remaining,
        })


async def _check_signed_in_deep_limit(user: dict, settings: Settings):
    """Check signed-in user's daily deep limit."""
    sb = get_supabase_client()
    if not sb:
        return
    try:
        profile = sb.table("profiles").select("deep_research_count, last_reset_date, tier").eq("id", user["id"]).execute()
        if not profile.data or len(profile.data) == 0:
            return
        data = profile.data[0]
        if data.get("tier") == "premium":
            return
        today = date.today().isoformat()
        if data.get("last_reset_date") != today:
            sb.table("profiles").update({"deep_research_count": 0, "last_reset_date": today}).eq("id", user["id"]).execute()
            return
        if data.get("deep_research_count", 0) >= FREE_DEEP_DAILY:
            raise HTTPException(status_code=429, detail={
                "message": f"You've used all {FREE_DEEP_DAILY} deep researches for today. Resets tomorrow.",
                "remaining_fast": max(0, FREE_FAST_DAILY),
                "remaining_deep": 0,
            })
    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"Could not check deep limit: {e}")


async def _check_concurrent_research(user: Optional[dict]):
    sb = get_supabase_client()
    if not sb or not user:
        return
    try:
        result = sb.table("research").select("id").eq("user_id", user["id"]).eq("status", "processing").execute()
        if result.data and len(result.data) > 0:
            raise HTTPException(status_code=409, detail="You already have a deep research in progress.")
    except HTTPException:
        raise
    except Exception:
        pass


async def _save_research(user: Optional[dict], idea: str, category: Optional[str], analysis_type: str, result: dict, status: str = "completed") -> Optional[str]:
    sb = get_supabase_client()
    if not sb or not user:
        return None
    try:
        record = sb.table("research").insert({
            "user_id": user["id"], "idea_text": idea, "category": category,
            "analysis_type": analysis_type, "result": result, "status": status,
        }).execute()
        return record.data[0]["id"] if record.data else None
    except Exception as e:
        logger.warning(f"Could not save research: {e}")
        return None


async def _update_research_status(research_id: Optional[str], status: str, result: Optional[dict] = None):
    sb = get_supabase_client()
    if not sb or not research_id:
        return
    try:
        update = {"status": status}
        if result is not None:
            update["result"] = result
        sb.table("research").update(update).eq("id", research_id).execute()
    except Exception as e:
        logger.warning(f"Could not update research status: {e}")


async def _increment_deep_count(user: Optional[dict]):
    sb = get_supabase_client()
    if not sb or not user:
        return
    try:
        sb.rpc("increment_deep_count", {"user_id_input": user["id"]}).execute()
    except Exception:
        try:
            profile = sb.table("profiles").select("deep_research_count").eq("id", user["id"]).single().execute()
            current = profile.data.get("deep_research_count", 0) if profile.data else 0
            sb.table("profiles").update({"deep_research_count": current + 1}).eq("id", user["id"]).execute()
        except Exception as e:
            logger.warning(f"Could not increment deep count: {e}")


def _get_research_or_404(research_id: str, user_id: str) -> dict:
    sb = get_supabase_client()
    if not sb:
        raise HTTPException(status_code=503, detail="Database not configured")
    try:
        result = sb.table("research").select("*").eq("id", research_id).eq("user_id", user_id).single().execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Research not found")
        return result.data
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Could not fetch research")


# ═══════════════════════════════════════
# GET /api/limits — frontend calls this to display remaining
# ═══════════════════════════════════════

@router.get("/limits")
async def get_limits(
    request: Request,
    user: Optional[dict] = Depends(get_current_user),
):
    """Returns remaining analysis counts for the current user or anonymous visitor."""
    if user:
        return await _get_signed_in_remaining(user)
    return _get_anon_remaining(request)


# ═══════════════════════════════════════
# Analysis Endpoints
# ═══════════════════════════════════════

@router.post("/analyze/fast")
@limiter.limit("10/minute")
async def analyze_fast(
    request: Request,
    req: AnalyzeRequest,
    settings: Settings = Depends(get_settings),
    user: Optional[dict] = Depends(get_current_user),
):
    if not settings.openai_api_key:
        raise HTTPException(status_code=503, detail="OpenAI API key not configured")
    if not user:
        await _check_turnstile(req.turnstile_token, settings)

    # Rate limit check
    if user:
        await _check_signed_in_fast_limit(user)
    else:
        _check_anon_limit(request, "fast")

    try:
        result = await fast_analysis(req.idea, req.category, settings)
        await _save_research(user, req.idea, req.category, "fast", result)

        # Increment anonymous counter AFTER success
        if not user:
            _increment_anon(request, "fast")

        # Attach remaining counts to response
        remaining = (await _get_signed_in_remaining(user)) if user else _get_anon_remaining(request)
        result["limits"] = remaining

        return result
    except HTTPException:
        raise
    except Exception:
        logger.exception("Fast analysis failed")
        raise HTTPException(status_code=500, detail="Analysis failed. Please try again.")


@router.post("/analyze/deep")
@limiter.limit("3/minute")
async def analyze_deep(
    request: Request,
    req: AnalyzeRequest,
    settings: Settings = Depends(get_settings),
    user: Optional[dict] = Depends(get_current_user),
):
    if not settings.openai_api_key:
        raise HTTPException(status_code=503, detail="OpenAI API key not configured")
    if not user:
        await _check_turnstile(req.turnstile_token, settings)

    # Rate limit check
    if user:
        await _check_signed_in_deep_limit(user, settings)
    else:
        _check_anon_limit(request, "deep")

    await _check_concurrent_research(user)

    research_id = await _save_research(user, req.idea, req.category, "deep", {}, status="processing")
    final_result = {}

    async def event_stream():
        nonlocal final_result
        try:
            async for event_type, data in deep_research_stream(req.idea, req.category, settings):
                if await request.is_disconnected():
                    logger.info(f"Client disconnected during deep research {research_id}")
                    await _update_research_status(research_id, "failed", {"error": "Client disconnected"})
                    return
                if event_type == "done":
                    final_result = data.get("report", data)
                    # Attach remaining counts to the done event
                    if not user:
                        _increment_anon(request, "deep")
                    remaining = (await _get_signed_in_remaining(user)) if user else _get_anon_remaining(request)
                    data["limits"] = remaining
                yield f"event: {event_type}\ndata: {json.dumps(data)}\n\n"
        except Exception:
            logger.exception("Deep research stream failed")
            yield f'event: error\ndata: {json.dumps({"message": "Research failed. Please try again."})}\n\n'
        finally:
            if final_result:
                await _update_research_status(research_id, "completed", final_result)
                await _increment_deep_count(user)
            elif research_id:
                await _update_research_status(research_id, "failed")

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
    )


# ═══════════════════════════════════════
# Research History
# ═══════════════════════════════════════

@router.get("/research")
async def get_research_history(user: dict = Depends(get_current_user)):
    if not user:
        return {"research": []}
    sb = get_supabase_client()
    if not sb:
        return {"research": []}
    try:
        result = sb.table("research").select("id, idea_text, category, analysis_type, status, created_at") \
            .eq("user_id", user["id"]).order("created_at", desc=True).limit(50).execute()
        return {"research": result.data or []}
    except Exception as e:
        logger.warning(f"Could not fetch research history: {e}")
        return {"research": []}


@router.get("/research/{research_id}")
async def get_research_detail(research_id: str, user: dict = Depends(get_current_user)):
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    sb = get_supabase_client()
    if not sb:
        raise HTTPException(status_code=503, detail="Database not configured")
    try:
        result = sb.table("research").select("*").eq("id", research_id).eq("user_id", user["id"]).single().execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Research not found")
        return result.data
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Could not fetch research")


# ═══════════════════════════════════════
# Chat Follow-ups
# ═══════════════════════════════════════

class ChatMessage(BaseModel):
    message: str = Field(..., max_length=1000)


@router.post("/research/{research_id}/chat")
async def send_chat_message(
    research_id: str,
    body: ChatMessage,
    user: dict = Depends(require_auth),
    settings: Settings = Depends(get_settings),
):
    research = _get_research_or_404(research_id, user["id"])
    if research.get("status") != "completed":
        raise HTTPException(status_code=400, detail="Research is not completed yet")

    sb = get_supabase_client()
    if not sb:
        raise HTTPException(status_code=503, detail="Database not configured")

    try:
        profile = sb.table("profiles").select("tier").eq("id", user["id"]).single().execute()
        tier = profile.data.get("tier", "free") if profile.data else "free"
        if tier == "free":
            chat_count = sb.table("chat_messages").select("id", count="exact") \
                .eq("research_id", research_id).eq("role", "user").execute()
            if chat_count.count and chat_count.count >= 5:
                raise HTTPException(status_code=429, detail="Free tier: 5 messages per research.")
    except HTTPException:
        raise
    except Exception:
        pass

    history = []
    try:
        hist = sb.table("chat_messages").select("role, content") \
            .eq("research_id", research_id).order("created_at").limit(20).execute()
        history = hist.data or []
    except Exception:
        pass

    reply = await chat_with_research(
        research_result=research.get("result", {}),
        idea=research.get("idea_text", ""),
        history=history,
        new_message=body.message,
        settings=settings,
    )

    try:
        sb.table("chat_messages").insert([
            {"research_id": research_id, "role": "user", "content": body.message},
            {"research_id": research_id, "role": "assistant", "content": reply},
        ]).execute()
    except Exception as e:
        logger.warning(f"Could not save chat messages: {e}")

    return {"reply": reply}


@router.get("/research/{research_id}/chat/history")
async def get_chat_history(research_id: str, user: dict = Depends(require_auth)):
    _get_research_or_404(research_id, user["id"])
    sb = get_supabase_client()
    if not sb:
        return {"messages": []}
    try:
        result = sb.table("chat_messages").select("role, content, created_at") \
            .eq("research_id", research_id).order("created_at").execute()
        return {"messages": result.data or []}
    except Exception:
        return {"messages": []}


# ═══════════════════════════════════════
# Notes
# ═══════════════════════════════════════

class NotesUpdate(BaseModel):
    notes: str = Field(..., max_length=5000)


@router.put("/research/{research_id}/notes")
async def save_notes(research_id: str, body: NotesUpdate, user: dict = Depends(require_auth)):
    _get_research_or_404(research_id, user["id"])
    sb = get_supabase_client()
    if not sb:
        raise HTTPException(status_code=503, detail="Database not configured")
    try:
        sb.table("research").update({"notes": body.notes}).eq("id", research_id).execute()
        return {"status": "saved"}
    except Exception:
        raise HTTPException(status_code=500, detail="Could not save notes")


@router.get("/research/{research_id}/notes")
async def get_notes(research_id: str, user: dict = Depends(require_auth)):
    research = _get_research_or_404(research_id, user["id"])
    return {"notes": research.get("notes", "")}


# ═══════════════════════════════════════
# PDF Export
# ═══════════════════════════════════════

@router.get("/research/{research_id}/export/pdf")
async def export_pdf(research_id: str, user: dict = Depends(require_auth)):
    research = _get_research_or_404(research_id, user["id"])
    if research.get("status") != "completed":
        raise HTTPException(status_code=400, detail="Research is not completed yet")
    try:
        pdf_bytes = generate_research_pdf(research)
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="shiporskip-{research_id[:8]}.pdf"'},
        )
    except Exception:
        logger.exception("PDF generation failed")
        raise HTTPException(status_code=500, detail="Could not generate PDF")