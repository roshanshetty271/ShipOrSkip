"""
Chat Service — Follow-up conversations about completed research.
Uses gpt-4.1-nano (answering questions about existing data = extraction task).
"""

import json
import logging
from openai import AsyncOpenAI, RateLimitError, APITimeoutError, APIError
from src.config import Settings

NANO = "gpt-4.1-nano-2025-04-14"

logger = logging.getLogger(__name__)


async def chat_with_research(
    research_result: dict,
    idea: str,
    history: list[dict],
    new_message: str,
    settings: Settings,
) -> str:
    """Generate a chat reply with full research context."""
    client = AsyncOpenAI(api_key=settings.openai_api_key, timeout=60.0)

    result_summary = json.dumps(research_result, indent=2, default=str)[:4000]

    messages = [
        {
            "role": "system",
            "content": (
                "You are ShipOrSkip's research assistant. The user has already completed "
                "an idea validation analysis. Below is the full research result. "
                "Answer their follow-up questions based on this data. Be specific, "
                "cite competitors by name, and give actionable advice.\n\n"
                f"Original idea: {idea}\n\n"
                f"Research result:\n{result_summary}"
            ),
        },
    ]

    for msg in history[-10:]:
        messages.append({"role": msg["role"], "content": msg["content"]})

    messages.append({"role": "user", "content": new_message})

    try:
        completion = await client.chat.completions.create(
            model=NANO,
            messages=messages,
            max_tokens=800,
            temperature=0.3,
        )
        return completion.choices[0].message.content or "I couldn't generate a response. Please try again."
    except RateLimitError:
        logger.warning("OpenAI rate limit hit during chat")
        return "The AI service is currently busy. Please wait a moment and try again."
    except (APITimeoutError, APIError) as e:
        logger.warning(f"OpenAI API error during chat: {e}")
        return "The AI service timed out. Please try again."