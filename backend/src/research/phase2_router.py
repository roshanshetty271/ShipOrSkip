"""
Phase 2 Router — Chat with Research, Notes, PDF Export

Add these routes to your existing research/router.py or import as a separate router.
Mount with: app.include_router(phase2_router, prefix="/api")
"""

import json
import logging
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse, Response
from pydantic import BaseModel, Field

from src.auth.dependencies import require_auth, get_current_user
from src.config import get_settings, get_supabase_client, Settings
from src.research.chat_service import chat_with_research
from src.research.pdf_service import generate_research_pdf

logger = logging.getLogger(__name__)
phase2_router = APIRouter()


# ═══════════════════════════════════════
# Schemas
# ═══════════════════════════════════════

class ChatMessage(BaseModel):
    message: str = Field(..., max_length=1000)

class NotesUpdate(BaseModel):
    notes: str = Field(..., max_length=10000)


# ═══════════════════════════════════════
# Chat with Research
# ═══════════════════════════════════════

@phase2_router.post("/research/{research_id}/chat")
async def chat_with_research_endpoint(
    research_id: UUID,
    body: ChatMessage,
    settings: Settings = Depends(get_settings),
    user: dict = Depends(require_auth),
):
    """Send a follow-up question about a completed research."""
    sb = get_supabase_client()
    if not sb:
        raise HTTPException(status_code=503, detail="Database not configured")

    # Fetch the research (RLS ensures ownership)
    try:
        res = sb.table("research") \
            .select("*") \
            .eq("id", research_id) \
            .eq("user_id", user["id"]) \
            .single() \
            .execute()
        if not res.data:
            raise HTTPException(status_code=404, detail="Research not found")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Could not fetch research")

    research = res.data

    # Fetch conversation history
    try:
        history_res = sb.table("chat_messages") \
            .select("role, content") \
            .eq("research_id", research_id) \
            .order("created_at", desc=False) \
            .limit(20) \
            .execute()
        history = history_res.data or []
    except Exception:
        history = []

    # Check chat limit for free users (5 per research)
    user_msgs = [m for m in history if m["role"] == "user"]
    # Fetch tier
    try:
        profile = sb.table("profiles").select("tier").eq("id", user["id"]).single().execute()
        tier = profile.data.get("tier", "free") if profile.data else "free"
    except Exception:
        tier = "free"

    if tier == "free" and len(user_msgs) >= 5:
        raise HTTPException(status_code=429, detail="Free tier limit: 5 follow-up questions per research. Upgrade for unlimited.")

    # Save user message
    try:
        sb.table("chat_messages").insert({
            "research_id": research_id,
            "role": "user",
            "content": body.message,
        }).execute()
    except Exception as e:
        logger.warning(f"Could not save user message: {e}")

    # Generate AI response with research context
    try:
        reply = await chat_with_research(
            research_result=research.get("result", {}),
            idea=research.get("idea_text", ""),
            history=history,
            new_message=body.message,
            settings=settings,
        )
    except Exception as e:
        logger.exception("Chat failed")
        raise HTTPException(status_code=500, detail="Chat failed. Please try again.")

    # Save assistant message
    try:
        sb.table("chat_messages").insert({
            "research_id": research_id,
            "role": "assistant",
            "content": reply,
        }).execute()
    except Exception as e:
        logger.warning(f"Could not save assistant message: {e}")

    return {"role": "assistant", "content": reply}


@phase2_router.get("/research/{research_id}/chat/history")
async def get_chat_history(
    research_id: UUID,
    user: dict = Depends(require_auth),
):
    """Get conversation history for a research."""
    sb = get_supabase_client()
    if not sb:
        return {"messages": []}

    # Verify ownership
    try:
        res = sb.table("research").select("id").eq("id", research_id).eq("user_id", user["id"]).single().execute()
        if not res.data:
            raise HTTPException(status_code=404, detail="Research not found")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Could not verify ownership")

    try:
        result = sb.table("chat_messages") \
            .select("id, role, content, created_at") \
            .eq("research_id", research_id) \
            .order("created_at", desc=False) \
            .execute()
        return {"messages": result.data or []}
    except Exception:
        return {"messages": []}


# ═══════════════════════════════════════
# Research Notes
# ═══════════════════════════════════════

@phase2_router.put("/research/{research_id}/notes")
async def update_notes(
    research_id: UUID,
    body: NotesUpdate,
    user: dict = Depends(require_auth),
):
    """Save or update notes for a research."""
    sb = get_supabase_client()
    if not sb:
        raise HTTPException(status_code=503, detail="Database not configured")

    try:
        result = sb.table("research") \
            .update({"notes": body.notes}) \
            .eq("id", research_id) \
            .eq("user_id", user["id"]) \
            .execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Research not found")
        return {"status": "saved"}
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Could not save notes")


@phase2_router.get("/research/{research_id}/notes")
async def get_notes(
    research_id: UUID,
    user: dict = Depends(require_auth),
):
    """Get notes for a research."""
    sb = get_supabase_client()
    if not sb:
        return {"notes": ""}

    try:
        result = sb.table("research") \
            .select("notes") \
            .eq("id", research_id) \
            .eq("user_id", user["id"]) \
            .single() \
            .execute()
        return {"notes": result.data.get("notes", "") if result.data else ""}
    except Exception:
        return {"notes": ""}


# ═══════════════════════════════════════
# PDF Export
# ═══════════════════════════════════════

@phase2_router.get("/research/{research_id}/export/pdf")
async def export_pdf(
    research_id: UUID,
    user: dict = Depends(require_auth),
):
    """Generate and download a PDF report for a research."""
    sb = get_supabase_client()
    if not sb:
        raise HTTPException(status_code=503, detail="Database not configured")

    # Check export limit for free users (2/month)
    try:
        profile = sb.table("profiles").select("tier").eq("id", user["id"]).single().execute()
        tier = profile.data.get("tier", "free") if profile.data else "free"
    except Exception:
        tier = "free"

    # Fetch research
    try:
        res = sb.table("research") \
            .select("*") \
            .eq("id", research_id) \
            .eq("user_id", user["id"]) \
            .single() \
            .execute()
        if not res.data:
            raise HTTPException(status_code=404, detail="Research not found")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Could not fetch research")

    research = res.data

    try:
        pdf_bytes = generate_research_pdf(research)
    except Exception as e:
        logger.exception("PDF generation failed")
        raise HTTPException(status_code=500, detail="PDF generation failed")

    filename = f"shiporskip-{research_id[:8]}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
