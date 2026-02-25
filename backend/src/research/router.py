"""
ShipOrSkip Research Router

All research endpoints in one place:
- POST /analyze/fast         — fast analysis
- POST /analyze/deep         — deep research (SSE stream)
- GET  /research             — research history
- GET  /research/{id}        — research detail
- POST /research/{id}/chat   — chat follow-up
- GET  /research/{id}/chat/history — chat history
- PUT  /research/{id}/notes  — save notes
- GET  /research/{id}/notes  — get notes
- GET  /research/{id}/export/pdf — PDF download
"""

import json
import logging
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse, Response
from pydantic import BaseModel, Field

from src.middleware import limiter
from src.research.schemas import AnalyzeRequest
from src.research.service import fast_analysis, deep_research_stream
from src.research.chat_service import chat_with_research
from src.research.pdf_service import generate_research_pdf
from src.auth.dependencies import get_current_user, require_auth
from src.auth.service import verify_turnstile
from src.config import get_settings, get_supabase_client, Settings

logger = logging.getLogger(__name__)
router = APIRouter()

# Test keys that should always be skipped
_TURNSTILE_TEST_KEYS = {
    "",
    "1x0000000000000000000000000000000AA",
    "1x00000000000000000000AA",
}


# ═══════════════════════════════════════
# Request Models (chat/notes specific)
# ═══════════════════════════════════════

class ChatMessage(BaseModel):
    message: str = Field(..., max_length=1000)


class NotesUpdate(BaseModel):
    notes: str = Field(..., max_length=5000)


# ═══════════════════════════════════════
# Internal Helpers
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


async def _check_deep_limit(user: Optional[dict], settings: Settings):
    sb = get_supabase_client()
    if not sb or not user:
        return
    uid = user["id"]
    try:
        profile = sb.table("profiles").select("deep_research_count, last_reset_date, tier").eq("id", uid).single().execute()
        if not profile.data:
            return
        data = profile.data
        today = date.today().isoformat()
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
    await _check_turnstile(req.turnstile_token, settings)
    try:
        result = await fast_analysis(req.idea, req.category, settings)
        await _save_research(user, req.idea, req.category, "fast", result)
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
    await _check_turnstile(req.turnstile_token, settings)
    await _check_deep_limit(user, settings)
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

    # Free tier: 5 messages per research
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

    # Get history
    history = []
    try:
        hist = sb.table("chat_messages").select("role, content") \
            .eq("research_id", research_id).order("created_at").limit(20).execute()
        history = hist.data or []
    except Exception:
        pass

    # AI reply
    reply = await chat_with_research(
        research_result=research.get("result", {}),
        idea=research.get("idea_text", ""),
        history=history,
        new_message=body.message,
        settings=settings,
    )

    # Save messages
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