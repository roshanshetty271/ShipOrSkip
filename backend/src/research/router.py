import json
import logging
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from src.research.schemas import AnalyzeRequest
from src.research.service import fast_analysis, deep_research_stream
from src.config import get_settings, Settings

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/analyze/fast")
async def analyze_fast(
    req: AnalyzeRequest,
    settings: Settings = Depends(get_settings),
):
    if not settings.openai_api_key:
        raise HTTPException(status_code=503, detail="OpenAI API key not configured")
    try:
        result = await fast_analysis(req.idea, req.category, settings)
        return result
    except Exception as e:
        logger.exception("Fast analysis failed")
        raise HTTPException(status_code=500, detail="Analysis failed. Please try again.")


@router.post("/analyze/deep")
async def analyze_deep(
    req: AnalyzeRequest,
    settings: Settings = Depends(get_settings),
):
    if not settings.openai_api_key:
        raise HTTPException(status_code=503, detail="OpenAI API key not configured")

    async def event_stream():
        try:
            async for event_type, data in deep_research_stream(req.idea, req.category, settings):
                yield f"event: {event_type}\ndata: {json.dumps(data)}\n\n"
        except Exception as e:
            logger.exception("Deep research stream failed")
            yield f'event: error\ndata: {json.dumps({"message": "Research failed. Please try again."})}\n\n'

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
