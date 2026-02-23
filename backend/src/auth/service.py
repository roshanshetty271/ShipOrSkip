import httpx


async def verify_turnstile(token: str, secret_key: str) -> bool:
    """Verify Cloudflare Turnstile token server-side."""
    if not secret_key or not token:
        return False
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                "https://challenges.cloudflare.com/turnstile/v0/siteverify",
                data={"secret": secret_key, "response": token},
                timeout=5.0,
            )
            return resp.json().get("success", False)
    except Exception:
        return False
