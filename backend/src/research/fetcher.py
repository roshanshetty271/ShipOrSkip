"""
ShipOrSkip Fetcher Service

- GitHub README fetching (free, no auth needed)
- Deep page fetching via trafilatura (free, handles JS-heavy sites)
- Domain blocklist (skip garbage)
- Title blocklist (skip "best X alternatives" blog posts)
- URL ranking (prioritize high-value sources)
- Context assembly with source-priority budgeting
"""

import asyncio
import re
from typing import Optional

import httpx

try:
    from fake_useragent import UserAgent
    _ua = UserAgent()
    def _random_ua() -> str:
        return _ua.random
except ImportError:
    def _random_ua() -> str:
        return "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36"

try:
    import trafilatura
    HAS_TRAFILATURA = True
except ImportError:
    HAS_TRAFILATURA = False


def _log(msg: str):
    print(f"[ShipOrSkip:Fetcher] {msg}", flush=True)


# ═══════════════════════════════════════
# Domain Blocklist
# ═══════════════════════════════════════

DOMAIN_BLOCKLIST = {
    # Generic listicles / low-signal
    "forbes.com", "businessinsider.com", "entrepreneur.com",
    "inc.com", "fastcompany.com", "wired.com",
    # Aggregators
    "g2.com", "capterra.com", "alternativeto.com",
    "slant.co", "sourceforge.net", "softwareadvice.com",
    # Review/comparison sites (not competitors themselves)
    "futurepedia.io", "pineapplebuilder.com", "bubble.io",
    "flowjam.com", "theresanaiforthat.com",
    # Job boards
    "indeed.com", "glassdoor.com", "linkedin.com",
    # Social media
    "twitter.com", "x.com", "facebook.com", "instagram.com",
    # Paywalled
    "nytimes.com", "wsj.com", "ft.com", "bloomberg.com",
    # Heavy anti-bot
    "amazon.com", "imdb.com",
    # Generic tech news
    "techcrunch.com", "theverge.com", "zdnet.com", "cnet.com",
    # Wikipedia
    "wikipedia.org",
    # Medium
    "medium.com",
    # YouTube (not competitors)
    "youtube.com",
    # App stores (listings, not the apps themselves)
    "play.google.com", "apps.apple.com",
    # Your own projects
    "worth-the-watch.vercel.app", "shiporskip.vercel.app",
    "ship-or-skip-peach.vercel.app",
}

# High-value domains get priority
HIGH_VALUE_DOMAINS = {
    "github.com", "producthunt.com", "news.ycombinator.com",
    "indiehackers.com", "devpost.com",
    "reddit.com", "dev.to", "hashnode.dev",
}

# Title patterns that indicate blog posts / listicles, not actual products
TITLE_BLOCKLIST_PATTERNS = [
    r"best .+ alternatives",
    r"\d+ best .+",
    r"top \d+",
    r"how to build",
    r"how to create",
    r"alternatives for",
    r"vs\b",  # "X vs Y" comparison articles
    r"reviews?:.+pricing",
    r"reviews?:.+alternatives",
    r"ultimate guide",
    r"complete guide",
]


def is_blocked(url: str) -> bool:
    """Check if URL domain is in blocklist."""
    try:
        domain = url.split("//")[-1].split("/")[0].lower()
        domain = domain.replace("www.", "")
        return any(domain.endswith(blocked) for blocked in DOMAIN_BLOCKLIST)
    except Exception:
        return False


def is_title_blocked(title: str) -> bool:
    """Check if title matches a blog/listicle pattern."""
    lower = title.lower().strip()
    for pattern in TITLE_BLOCKLIST_PATTERNS:
        if re.search(pattern, lower):
            return True
    return False


def url_score(url: str) -> int:
    """Score a URL for prioritization. Higher = better."""
    try:
        domain = url.split("//")[-1].split("/")[0].lower().replace("www.", "")
    except Exception:
        return 0

    if "github.com" in domain and url.count("/") >= 4:
        return 100
    if "producthunt.com" in domain and "/posts/" in url:
        return 95
    if "producthunt.com" in domain and "/products/" in url:
        return 95
    for hv in HIGH_VALUE_DOMAINS:
        if domain.endswith(hv):
            return 80
    if url.count("/") <= 3:
        return 60
    return 30


# ═══════════════════════════════════════
# GitHub README Fetcher
# ═══════════════════════════════════════

def _extract_github_repos(urls: list[str]) -> list[tuple[str, str]]:
    repos = []
    seen = set()
    for url in urls:
        match = re.search(r"github\.com/([^/]+)/([^/?#]+)", url)
        if match:
            owner, repo = match.group(1), match.group(2)
            key = f"{owner}/{repo}".lower()
            if key not in seen and owner not in ("topics", "search", "trending", "explore"):
                seen.add(key)
                repos.append((owner, repo))
    return repos


async def fetch_github_readmes(urls: list[str], max_repos: int = 8) -> dict[str, str]:
    repos = _extract_github_repos(urls)[:max_repos]
    if not repos:
        return {}

    _log(f"  Fetching {len(repos)} GitHub READMEs...")
    readmes = {}

    async with httpx.AsyncClient(timeout=8.0) as http:
        tasks = [_fetch_single_readme(http, owner, repo) for owner, repo in repos]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        for (owner, repo), result in zip(repos, results):
            slug = f"{owner}/{repo}"
            if isinstance(result, str) and len(result) > 100:
                readmes[slug] = result[:3000]
                _log(f"    ✓ {slug}: {len(result)} chars (truncated to 3000)")
            elif isinstance(result, str):
                _log(f"    ✗ {slug}: too short ({len(result)} chars)")
            else:
                _log(f"    ✗ {slug}: {result}")

    return readmes


async def _fetch_single_readme(http: httpx.AsyncClient, owner: str, repo: str) -> str:
    for branch in ("main", "master"):
        url = f"https://raw.githubusercontent.com/{owner}/{repo}/{branch}/README.md"
        try:
            resp = await http.get(url, headers={"User-Agent": _random_ua()})
            if resp.status_code == 200:
                return resp.text
        except Exception:
            continue
    return ""


# ═══════════════════════════════════════
# Deep Page Fetcher (trafilatura)
# ═══════════════════════════════════════

async def deep_fetch_pages(
    urls: list[str], max_pages: int = 8, race_target: int = 5,
) -> dict[str, str]:
    if not HAS_TRAFILATURA:
        _log("  trafilatura not installed — skipping deep fetch")
        return {}

    ranked = [(url, url_score(url)) for url in urls if not is_blocked(url)]
    ranked.sort(key=lambda x: -x[1])
    targets = [url for url, _ in ranked[:max_pages]]

    if not targets:
        return {}

    _log(f"  Deep fetching {len(targets)} pages (race to {race_target})...")
    results = {}
    sem = asyncio.Semaphore(5)

    async def fetch_one(url: str) -> tuple[str, str]:
        async with sem:
            try:
                async with httpx.AsyncClient(timeout=10.0) as http:
                    resp = await http.get(url, headers={"User-Agent": _random_ua()}, follow_redirects=True)
                    if resp.status_code == 200:
                        text = await asyncio.to_thread(
                            trafilatura.extract, resp.text,
                            include_comments=False, include_tables=False,
                        )
                        return url, (text or "")[:3000]
            except Exception as e:
                _log(f"    ✗ {url[:50]}: {e}")
            return url, ""

    tasks = [asyncio.create_task(fetch_one(url)) for url in targets]
    completed = 0
    for coro in asyncio.as_completed(tasks):
        url, content = await coro
        if content and len(content) > 200:
            results[url] = content
            completed += 1
            _log(f"    ✓ [{completed}/{race_target}] {url[:60]} ({len(content)} chars)")
            if completed >= race_target:
                for t in tasks:
                    if not t.done(): t.cancel()
                _log(f"    Reached {race_target} — cancelled remaining tasks")
                break
        else:
            _log(f"    ✗ {url[:60]}: empty/too short")

    return results


# ═══════════════════════════════════════
# Context Assembly
# ═══════════════════════════════════════

def assemble_deep_context(
    tavily_results: list[dict], github_readmes: dict[str, str],
    ph_results: list[str], deep_pages: dict[str, str],
    max_chars: int = 12000,
) -> str:
    github_budget = int(max_chars * 0.40)
    competitor_budget = int(max_chars * 0.40)
    snippet_budget = int(max_chars * 0.20)

    sections = []

    gh_section = []
    chars_used = 0
    for slug, readme in github_readmes.items():
        chunk = f"### GitHub: {slug}\n{readme}\n"
        if chars_used + len(chunk) > github_budget:
            chunk = chunk[:github_budget - chars_used]
        gh_section.append(chunk)
        chars_used += len(chunk)
        if chars_used >= github_budget: break

    for ph in ph_results[:5]:
        if chars_used + len(ph) > github_budget: break
        gh_section.append(ph)
        chars_used += len(ph)

    if gh_section:
        sections.append("## GitHub Repos & Product Hunt Launches\n" + "\n".join(gh_section))

    deep_section = []
    chars_used = 0
    for url, content in deep_pages.items():
        if "github.com" in url: continue
        chunk = f"### {url}\n{content}\n"
        if chars_used + len(chunk) > competitor_budget:
            chunk = chunk[:competitor_budget - chars_used]
        deep_section.append(chunk)
        chars_used += len(chunk)
        if chars_used >= competitor_budget: break

    if deep_section:
        sections.append("## Competitor Pages (Full Content)\n" + "\n".join(deep_section))

    snippet_section = []
    chars_used = 0
    for r in tavily_results[:15]:
        title = r.get("title", "")
        url = r.get("url", "")
        content = (r.get("content", "") or "")[:200]
        line = f"- {title} ({url}): {content}"
        if chars_used + len(line) > snippet_budget: break
        snippet_section.append(line)
        chars_used += len(line)

    if snippet_section:
        sections.append("## Market Context (Snippets)\n" + "\n".join(snippet_section))

    combined = "\n\n".join(sections)
    _log(f"  [Context] Assembled {len(combined)} chars ({len(github_readmes)} READMEs, {len(deep_pages)} pages, {len(snippet_section)} snippets)")
    return combined


def assemble_fast_context(tavily_results: list[dict], max_chars: int = 6000) -> str:
    seen = set()
    filtered = []
    for r in tavily_results:
        url = r.get("url", "").lower().rstrip("/")
        title = r.get("title", "")
        if url and url not in seen and not is_blocked(r.get("url", "")) and not is_title_blocked(title):
            seen.add(url)
            filtered.append(r)

    filtered.sort(key=lambda r: (
        -len(r.get("raw_content", "") or ""),
        -url_score(r.get("url", "")),
    ))

    lines = []
    chars_used = 0
    for r in filtered[:15]:
        title = r.get("title", "")
        url = r.get("url", "")
        raw = r.get("raw_content", "") or ""
        snippet = r.get("content", "") or ""
        content = raw[:500] if len(raw) > 100 else snippet[:300]
        line = f"- {title} ({url})\n  {content}"
        if chars_used + len(line) > max_chars: break
        lines.append(line)
        chars_used += len(line)

    if not lines:
        return "No search results available."
    return "\n\n".join(lines)