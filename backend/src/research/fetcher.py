"""
ShipOrSkip Fetcher Service

- GitHub README fetching (free, no auth needed)
- Deep page fetching via trafilatura (free, handles JS-heavy sites)
- Domain blocklist (skip garbage)
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
    # Aggregators (list everything, no real signal)
    "g2.com", "capterra.com", "alternativeto.com",
    "slant.co", "sourceforge.net", "softwareadvice.com",
    # Job boards
    "indeed.com", "glassdoor.com", "linkedin.com",
    # Social media (snippets are enough, pages are blocked)
    "twitter.com", "x.com", "facebook.com", "instagram.com",
    # Paywalled
    "nytimes.com", "wsj.com", "ft.com", "bloomberg.com",
    # Heavy anti-bot
    "amazon.com", "imdb.com",
    # Generic tech news (too broad)
    "techcrunch.com", "theverge.com", "zdnet.com", "cnet.com",
    # Wikipedia (LLM already knows this)
    "wikipedia.org",
    # Medium (mostly fluff)
    "medium.com",
}

# High-value domains get priority
HIGH_VALUE_DOMAINS = {
    "github.com", "producthunt.com", "news.ycombinator.com",
    "indiehackers.com", "devpost.com", "alternativeto.com",
    "reddit.com", "dev.to", "hashnode.dev",
}


def is_blocked(url: str) -> bool:
    """Check if URL domain is in blocklist."""
    try:
        domain = url.split("//")[-1].split("/")[0].lower()
        # Remove www.
        domain = domain.replace("www.", "")
        return any(domain.endswith(blocked) for blocked in DOMAIN_BLOCKLIST)
    except Exception:
        return False


def url_score(url: str) -> int:
    """Score a URL for prioritization. Higher = better."""
    try:
        domain = url.split("//")[-1].split("/")[0].lower().replace("www.", "")
    except Exception:
        return 0

    # GitHub repos (not just github.com pages)
    if "github.com" in domain and url.count("/") >= 4:
        return 100

    # Product Hunt launch pages
    if "producthunt.com" in domain and "/posts/" in url:
        return 95

    # High-value communities
    for hv in HIGH_VALUE_DOMAINS:
        if domain.endswith(hv):
            return 80

    # Actual product/app domains (short paths = likely homepage)
    if url.count("/") <= 3:
        return 60

    # Everything else
    return 30


# ═══════════════════════════════════════
# GitHub README Fetcher
# ═══════════════════════════════════════

def _extract_github_repos(urls: list[str]) -> list[tuple[str, str]]:
    """Extract (owner, repo) tuples from GitHub URLs."""
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
    """Fetch README.md for GitHub repos found in URLs. Returns {repo_slug: content}."""
    repos = _extract_github_repos(urls)[:max_repos]
    if not repos:
        return {}

    _log(f"  Fetching {len(repos)} GitHub READMEs...")
    readmes = {}

    async with httpx.AsyncClient(timeout=8.0) as http:
        tasks = []
        for owner, repo in repos:
            tasks.append(_fetch_single_readme(http, owner, repo))

        results = await asyncio.gather(*tasks, return_exceptions=True)
        for (owner, repo), result in zip(repos, results):
            slug = f"{owner}/{repo}"
            if isinstance(result, str) and len(result) > 100:
                # Truncate massive READMEs
                readmes[slug] = result[:3000]
                _log(f"    ✓ {slug}: {len(result)} chars (truncated to 3000)")
            elif isinstance(result, str):
                _log(f"    ✗ {slug}: too short ({len(result)} chars)")
            else:
                _log(f"    ✗ {slug}: {result}")

    return readmes


async def _fetch_single_readme(http: httpx.AsyncClient, owner: str, repo: str) -> str:
    """Try main branch, then master branch."""
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
    urls: list[str],
    max_pages: int = 8,
    race_target: int = 5,
) -> dict[str, str]:
    """
    Fetch full page content for URLs using trafilatura.
    Implements "Race to N" — cancels remaining once we have enough.
    Returns {url: extracted_text}.
    """
    if not HAS_TRAFILATURA:
        _log("  trafilatura not installed — skipping deep fetch")
        return {}

    # Filter and rank
    ranked = [(url, url_score(url)) for url in urls if not is_blocked(url)]
    ranked.sort(key=lambda x: -x[1])
    targets = [url for url, _ in ranked[:max_pages]]

    if not targets:
        return {}

    _log(f"  Deep fetching {len(targets)} pages (race to {race_target})...")
    results = {}
    sem = asyncio.Semaphore(5)  # Max 5 concurrent

    async def fetch_one(url: str) -> tuple[str, str]:
        async with sem:
            try:
                async with httpx.AsyncClient(timeout=10.0) as http:
                    resp = await http.get(
                        url,
                        headers={"User-Agent": _random_ua()},
                        follow_redirects=True,
                    )
                    if resp.status_code == 200:
                        text = await asyncio.to_thread(
                            trafilatura.extract,
                            resp.text,
                            include_comments=False,
                            include_tables=False,
                        )
                        return url, (text or "")[:3000]
            except Exception as e:
                _log(f"    ✗ {url[:50]}: {e}")
            return url, ""

    # Launch all tasks
    tasks = [asyncio.create_task(fetch_one(url)) for url in targets]

    # Race to N
    completed = 0
    for coro in asyncio.as_completed(tasks):
        url, content = await coro
        if content and len(content) > 200:
            results[url] = content
            completed += 1
            _log(f"    ✓ [{completed}/{race_target}] {url[:60]} ({len(content)} chars)")
            if completed >= race_target:
                # Cancel remaining
                for t in tasks:
                    if not t.done():
                        t.cancel()
                _log(f"    Reached {race_target} — cancelled remaining tasks")
                break
        else:
            _log(f"    ✗ {url[:60]}: empty/too short")

    return results


# ═══════════════════════════════════════
# Context Assembly
# ═══════════════════════════════════════

def assemble_deep_context(
    tavily_results: list[dict],
    github_readmes: dict[str, str],
    ph_results: list[str],
    deep_pages: dict[str, str],
    max_chars: int = 12000,
) -> str:
    """
    Assemble context with source-priority budgeting.
    40% GitHub READMEs + PH
    40% Deep-fetched competitor pages
    20% Tavily snippets (market context)
    """
    github_budget = int(max_chars * 0.40)
    competitor_budget = int(max_chars * 0.40)
    snippet_budget = int(max_chars * 0.20)

    sections = []

    # --- GitHub READMEs + PH (40%) ---
    gh_section = []
    chars_used = 0
    for slug, readme in github_readmes.items():
        chunk = f"### GitHub: {slug}\n{readme}\n"
        if chars_used + len(chunk) > github_budget:
            chunk = chunk[:github_budget - chars_used]
        gh_section.append(chunk)
        chars_used += len(chunk)
        if chars_used >= github_budget:
            break

    # Add PH results to this budget
    for ph in ph_results[:5]:
        if chars_used + len(ph) > github_budget:
            break
        gh_section.append(ph)
        chars_used += len(ph)

    if gh_section:
        sections.append("## GitHub Repos & Product Hunt Launches\n" + "\n".join(gh_section))

    # --- Deep-fetched pages (40%) ---
    deep_section = []
    chars_used = 0
    for url, content in deep_pages.items():
        # Skip GitHub pages (already in README section)
        if "github.com" in url:
            continue
        chunk = f"### {url}\n{content}\n"
        if chars_used + len(chunk) > competitor_budget:
            chunk = chunk[:competitor_budget - chars_used]
        deep_section.append(chunk)
        chars_used += len(chunk)
        if chars_used >= competitor_budget:
            break

    if deep_section:
        sections.append("## Competitor Pages (Full Content)\n" + "\n".join(deep_section))

    # --- Tavily snippets as market context (20%) ---
    snippet_section = []
    chars_used = 0
    for r in tavily_results[:15]:
        title = r.get("title", "")
        url = r.get("url", "")
        content = (r.get("content", "") or "")[:200]
        line = f"- {title} ({url}): {content}"
        if chars_used + len(line) > snippet_budget:
            break
        snippet_section.append(line)
        chars_used += len(line)

    if snippet_section:
        sections.append("## Market Context (Snippets)\n" + "\n".join(snippet_section))

    combined = "\n\n".join(sections)
    _log(f"  [Context] Assembled {len(combined)} chars ({len(github_readmes)} READMEs, {len(deep_pages)} pages, {len(snippet_section)} snippets)")
    return combined


def assemble_fast_context(
    tavily_results: list[dict],
    max_chars: int = 6000,
) -> str:
    """
    Assemble context for fast mode.
    Prioritizes results with raw_content, uses snippets as fallback.
    Filters blocked domains.
    """
    # Filter and dedupe
    seen = set()
    filtered = []
    for r in tavily_results:
        url = r.get("url", "").lower().rstrip("/")
        if url and url not in seen and not is_blocked(r.get("url", "")):
            seen.add(url)
            filtered.append(r)

    # Sort: results with raw_content first, then by URL score
    filtered.sort(key=lambda r: (
        -len(r.get("raw_content", "") or ""),
        -url_score(r.get("url", "")),
    ))

    lines = []
    chars_used = 0
    for r in filtered[:15]:
        title = r.get("title", "")
        url = r.get("url", "")

        # Use raw_content if available (truncated), else snippet
        raw = r.get("raw_content", "") or ""
        snippet = r.get("content", "") or ""
        content = raw[:500] if len(raw) > 100 else snippet[:300]

        line = f"- {title} ({url})\n  {content}"
        if chars_used + len(line) > max_chars:
            break
        lines.append(line)
        chars_used += len(line)

    if not lines:
        return "No search results available."

    return "\n\n".join(lines)