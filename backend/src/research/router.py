"""
ShipOrSkip Research Router

Rate limits:
  Per-minute (slowapi):    10/min fast, 3/min deep
  Anonymous (IP tracked):  3 fast total, 1 deep total (persisted in DB)
  Signed-in Free:          10 fast / 3 deep per rolling 24h window
  Signed-in Premium:       unlimited
  Chat: 5 messages/research (free tier)

All analysis endpoints return remaining counts + next_available_at timestamps.
GET /api/limits returns current remaining for frontend display.
"""

import hashlib
import json
import logging
from datetime import datetime, timedelta, timezone
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

ADMIN_EMAILS = {"roshanshetty271@gmail.com"}

# ═══════════════════════════════════════
# Limits
# ═══════════════════════════════════════

ANON_FAST_LIMIT = 3
ANON_DEEP_LIMIT = 1
FREE_FAST_DAILY = 10
FREE_DEEP_DAILY = 3

# ═══════════════════════════════════════
# ═══════════════════════════════════════

_verified_ips: set[str] = set()


def _get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _hash_ip(ip: str) -> str:
    return hashlib.sha256(ip.encode()).hexdigest()


def _get_anon_usage(ip_hash: str) -> dict:
    """Fetch anonymous usage from DB. Falls back to zeros on error."""
    sb = get_supabase_client()
    if not sb:
        return {"fast": 0, "deep": 0}
    try:
        result = sb.table("anon_usage").select("fast_count, deep_count").eq("ip_hash", ip_hash).execute()
        if result.data and len(result.data) > 0:
            row = result.data[0]
            return {"fast": row.get("fast_count", 0), "deep": row.get("deep_count", 0)}
    except Exception as e:
        logger.warning(f"Could not fetch anon usage: {e}")
    return {"fast": 0, "deep": 0}


def _increment_anon_db(ip_hash: str, analysis_type: str):
    """Persist anonymous usage bump to DB via upsert."""
    sb = get_supabase_client()
    if not sb:
        return
    try:
        col = "fast_count" if analysis_type == "fast" else "deep_count"
        existing = sb.table("anon_usage").select("fast_count, deep_count").eq("ip_hash", ip_hash).execute()
        if existing.data and len(existing.data) > 0:
            current = existing.data[0].get(col, 0)
            sb.table("anon_usage").update({col: current + 1}).eq("ip_hash", ip_hash).execute()
        else:
            row = {"ip_hash": ip_hash, "fast_count": 0, "deep_count": 0}
            row[col] = 1
            sb.table("anon_usage").insert(row).execute()
    except Exception as e:
        logger.warning(f"Could not update anon usage: {e}")


# ═══════════════════════════════════════
# Rolling 24h window helpers
# ═══════════════════════════════════════

def _parse_ts(iso_str: str) -> datetime:
    """Parse ISO timestamp from Supabase into a timezone-aware datetime."""
    return datetime.fromisoformat(iso_str.replace("Z", "+00:00"))


def _get_rolling_usage(user_id: str, analysis_type: str, limit: int) -> dict:
    """Count analyses in the last 24h rolling window.
    Returns {used, remaining, next_available_at}."""
    sb = get_supabase_client()
    if not sb:
        return {"used": 0, "remaining": limit, "next_available_at": None}
    try:
        window_start = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
        result = sb.table("research").select("created_at") \
            .eq("user_id", user_id).eq("analysis_type", analysis_type) \
            .gte("created_at", window_start) \
            .order("created_at").execute()

        timestamps = [row["created_at"] for row in (result.data or [])]
        used = len(timestamps)
        remaining = max(0, limit - used)

        next_available_at = None
        if remaining == 0 and timestamps:
            oldest = _parse_ts(timestamps[0])
            next_available_at = (oldest + timedelta(hours=24)).isoformat()

        return {"used": used, "remaining": remaining, "next_available_at": next_available_at}
    except Exception as e:
        logger.warning(f"Could not get rolling usage for {analysis_type}: {e}")
        return {"used": 0, "remaining": limit, "next_available_at": None}


def _get_anon_remaining(request: Request) -> dict:
    ip = _get_client_ip(request)
    usage = _get_anon_usage(_hash_ip(ip))
    return {
        "remaining_fast": max(0, ANON_FAST_LIMIT - usage["fast"]),
        "remaining_deep": max(0, ANON_DEEP_LIMIT - usage["deep"]),
        "tier": "anonymous",
        "fast_limit": ANON_FAST_LIMIT,
        "deep_limit": ANON_DEEP_LIMIT,
    }


def _default_free_limits():
    return {
        "remaining_fast": FREE_FAST_DAILY, "remaining_deep": FREE_DEEP_DAILY,
        "tier": "free", "fast_limit": FREE_FAST_DAILY, "deep_limit": FREE_DEEP_DAILY,
        "next_fast_available_at": None, "next_deep_available_at": None,
    }


async def _get_signed_in_remaining(user: dict) -> dict:
    sb = get_supabase_client()
    if not sb:
        return _default_free_limits()
    try:
        profile = sb.table("profiles").select("tier").eq("id", user["id"]).execute()
        tier = "free"
        if profile.data and len(profile.data) > 0:
            tier = profile.data[0].get("tier", "free")

        if tier == "premium":
            return {
                "remaining_fast": "unlimited", "remaining_deep": "unlimited",
                "tier": "premium", "fast_limit": "unlimited", "deep_limit": "unlimited",
                "next_fast_available_at": None, "next_deep_available_at": None,
            }

        fast = _get_rolling_usage(user["id"], "fast", FREE_FAST_DAILY)
        deep = _get_rolling_usage(user["id"], "deep", FREE_DEEP_DAILY)

        return {
            "remaining_fast": fast["remaining"],
            "remaining_deep": deep["remaining"],
            "tier": "free",
            "fast_limit": FREE_FAST_DAILY,
            "deep_limit": FREE_DEEP_DAILY,
            "next_fast_available_at": fast["next_available_at"],
            "next_deep_available_at": deep["next_available_at"],
        }
    except Exception as e:
        logger.warning(f"Could not get remaining: {e}")
        return _default_free_limits()


# ═══════════════════════════════════════
# Common checks
# ═══════════════════════════════════════

async def _check_turnstile(request: Request, token: Optional[str], settings: Settings):
    ip = _get_client_ip(request)
    if ip in _verified_ips:
        return

    secret = settings.turnstile_secret_key.strip()
    if not secret or secret in _TURNSTILE_TEST_KEYS:
        return
    if not token:
        raise HTTPException(status_code=400, detail="Bot verification required")
    valid = await verify_turnstile(token, secret)
    if not valid:
        raise HTTPException(status_code=403, detail="Bot verification failed")
    
    _verified_ips.add(ip)


def _check_anon_limit(request: Request, analysis_type: str):
    """Check anonymous usage from DB. Raises 429 if over limit."""
    ip = _get_client_ip(request)
    ip_hash = _hash_ip(ip)
    usage = _get_anon_usage(ip_hash)
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
    _increment_anon_db(_hash_ip(ip), analysis_type)


async def _check_signed_in_fast_limit(user: dict):
    """Check signed-in user's rolling 24h fast limit."""
    remaining = await _get_signed_in_remaining(user)
    if remaining.get("tier") == "premium":
        return
    if remaining["remaining_fast"] <= 0:
        raise HTTPException(status_code=429, detail={
            "message": f"You've used all {FREE_FAST_DAILY} fast analyses in the last 24 hours.",
            "next_available_at": remaining.get("next_fast_available_at"),
            **remaining,
        })


async def _check_signed_in_deep_limit(user: dict):
    """Check signed-in user's rolling 24h deep limit."""
    remaining = await _get_signed_in_remaining(user)
    if remaining.get("tier") == "premium":
        return
    if remaining["remaining_deep"] <= 0:
        raise HTTPException(status_code=429, detail={
            "message": f"You've used all {FREE_DEEP_DAILY} deep researches in the last 24 hours.",
            "next_available_at": remaining.get("next_deep_available_at"),
            **remaining,
        })


async def _check_concurrent_research(user: Optional[dict]):
    sb = get_supabase_client()
    if not sb or not user:
        return
    try:
        # First, clean up any globally stuck research (>10 min old)
        try:
            sb.rpc("cleanup_stuck_research").execute()
        except Exception:
            pass

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
        await _check_turnstile(request, req.turnstile_token, settings)

    # Rate limit check
    if user and user.get("email") not in ADMIN_EMAILS:
        await _check_signed_in_fast_limit(user)
    elif not user:
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
        await _check_turnstile(request, req.turnstile_token, settings)

    # Rate limit check
    if user and user.get("email") not in ADMIN_EMAILS:
        await _check_signed_in_deep_limit(user)
    elif not user:
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


@router.delete("/research")
async def delete_all_research(user: dict = Depends(require_auth)):
    sb = get_supabase_client()
    if not sb:
        raise HTTPException(status_code=503, detail="Database not configured")
    try:
        sb.table("research").delete().eq("user_id", user["id"]).execute()
        return {"status": "success", "message": "All research deleted"}
    except Exception as e:
        logger.exception("Could not delete all research")
        raise HTTPException(status_code=500, detail="Could not delete research history")


@router.delete("/research/{research_id}")
async def delete_research(research_id: str, user: dict = Depends(require_auth)):
    _get_research_or_404(research_id, user["id"])
    sb = get_supabase_client()
    if not sb:
        raise HTTPException(status_code=503, detail="Database not configured")
    try:
        sb.table("research").delete().eq("id", research_id).eq("user_id", user["id"]).execute()
        return {"status": "success", "message": "Research deleted"}
    except Exception as e:
        logger.exception(f"Could not delete research {research_id}")
        raise HTTPException(status_code=500, detail="Could not delete research")


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