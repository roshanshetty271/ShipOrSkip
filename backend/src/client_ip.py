"""Client IP lookup shared by the rate limiter and the research router."""

from starlette.requests import Request


def get_client_ip(request: Request) -> str:
    # Behind the Hugging Face proxy the socket peer is the proxy, so the
    # first X-Forwarded-For entry is used. A client can set that entry
    # itself. Which hop to trust has not been checked against the HF proxy
    # chain, so this stays as it was until that can be tested.
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"
