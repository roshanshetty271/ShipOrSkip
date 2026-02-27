"""
ShipOrSkip Fetcher Service

- GitHub README fetching
- Deep page fetching via trafilatura
- Domain blocklist
- Title blocklist (blog posts, listicles)
- Source relevance filtering (drops sources with zero keyword overlap)
- Caps raw_sources at 25 max
- URL ranking
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


MAX_RAW_SOURCES = 25

# ═══════════════════════════════════════
# Domain Blocklist
# ═══════════════════════════════════════

DOMAIN_BLOCKLIST = {
    "forbes.com", "businessinsider.com", "entrepreneur.com",
    "inc.com", "fastcompany.com", "wired.com",
    "g2.com", "capterra.com", "alternativeto.com",
    "slant.co", "sourceforge.net", "softwareadvice.com",
    "futurepedia.io", "pineapplebuilder.com", "bubble.io",
    "flowjam.com", "theresanaiforthat.com",
    "indeed.com", "glassdoor.com", "linkedin.com",
    "twitter.com", "x.com", "facebook.com", "instagram.com",
    "nytimes.com", "wsj.com", "ft.com", "bloomberg.com",
    "amazon.com", "imdb.com",
    "techcrunch.com", "theverge.com", "zdnet.com", "cnet.com",
    "wikipedia.org",
    "medium.com",
    "youtube.com",
    "play.google.com", "apps.apple.com",
    "worth-the-watch.vercel.app", "shiporskip.vercel.app",
    "ship-or-skip-peach.vercel.app",
    # Meta/aggregator sites that list tools but aren't tools themselves
    "soft112.com", "talkwalker.com", "owasp.org",
}

HIGH_VALUE_DOMAINS = {
    "github.com", "producthunt.com", "news.ycombinator.com",
    "indiehackers.com", "devpost.com",
    "reddit.com", "dev.to", "hashnode.dev",
}

# Title patterns that indicate blog posts / listicles, not actual products
TITLE_BLOCKLIST_PATTERNS = [
    r"^best .+ alternatives",
    r"^\d+ best .+",
    r"^top \d+",
    r"^how to build",
    r"^how to create",
    r"^how to use",
    r"alternatives for",
    r"alternatives to",
    r"alternatives \(",
    r"vs\b",
    r"reviews?:.+pricing",
    r"reviews?:.+alternatives",
    r"ultimate guide",
    r"complete guide",
    r"comparison table",
    r"^looking for",
    r"^modern assessments",
    r"^using web-based",
    r"^machine learning.based",
    r"a collection of awesome",
    r"a toolbox for",
]


def is_blocked(url: str) -> bool:
    try:
        domain = url.split("//")[-1].split("/")[0].lower().replace("www.", "")
        return any(domain.endswith(blocked) for blocked in DOMAIN_BLOCKLIST)
    except Exception:
        return False


def is_title_blocked(title: str) -> bool:
    lower = title.lower().strip()
    for pattern in TITLE_BLOCKLIST_PATTERNS:
        if re.search(pattern, lower):
            return True
    return False


def is_relevant_to_idea(title: str, snippet: str, cleaned_idea: str) -> bool:
    """Check if a source has ANY keyword overlap with the idea.
    Drops completely irrelevant sources like 'Car Damage Toolkit' for a quiz app."""
    if not cleaned_idea:
        return True  # no idea to check against, keep everything

    idea_words = set(cleaned_idea.lower().split())
    # Remove very common words that would match anything
    stop_words = {"app", "tool", "an", "a", "the", "for", "and", "or", "with", "to", "of", "in", "is", "it", "that", "this"}
    idea_words -= stop_words

    if len(idea_words) == 0:
        return True

    text = f"{title} {snippet}".lower()
    # Need at least 1 meaningful keyword overlap
    overlap = sum(1 for w in idea_words if w in text)
    return overlap >= 1


def url_score(url: str) -> int:
    try:
        domain = url.split("//")[-1].split("/")[0].lower().replace("www.", "")
    except Exception:
        return 0

    if "github.com" in domain and url.count("/") >= 4:
        return 100
    if "producthunt.com" in domain and ("/posts/" in url or "/products/" in url):
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
            if key not in seen and owner not in ("topics", "search", "trending", "explore", "orgs"):
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
# Deep Page Fetcher
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
# Raw Sources Builder — with relevance filter + cap
# ═══════════════════════════════════════

def build_raw_sources(
    tavily_results: list[dict],
    github_results: list[str],
    producthunt_results: list[str],
    cleaned_idea: str = "",
) -> list[dict]:
    """Build filtered, capped, relevance-checked raw sources list."""
    raw_sources = []

    # From Tavily
    for r in tavily_results:
        url, title = r.get("url", ""), r.get("title", "").strip()
        snippet = (r.get("content", "") or "")[:200].strip()
        if not url or not title:
            continue
        if is_title_blocked(title):
            continue
        if not is_relevant_to_idea(title, snippet, cleaned_idea):
            continue
        st = "github" if "github.com" in url else "producthunt" if "producthunt.com" in url else "reddit" if "reddit.com" in url else "hackernews" if "news.ycombinator.com" in url else "web"
        raw_sources.append({"title": title, "url": url, "snippet": snippet, "source_type": st, "score": url_score(url)})

    # From GitHub API
    for g in github_results:
        match = re.search(r'\(https://github\.com/([^)]+)\)', g)
        if match:
            gh_url = f"https://github.com/{match.group(1)}"
            if not any(s["url"] == gh_url for s in raw_sources):
                title = match.group(1)
                desc = g.split(" — ")[-1].split(" (")[0] if " — " in g else g[:150]
                if is_relevant_to_idea(title, desc, cleaned_idea):
                    raw_sources.append({"title": title, "url": gh_url, "snippet": desc[:200], "source_type": "github", "score": 100})

    # From Product Hunt
    for ph in producthunt_results:
        match = re.search(r'\((https://[^)]+producthunt[^)]+)\)', ph)
        if match:
            ph_url = match.group(1)
            if not any(s["url"] == ph_url for s in raw_sources):
                title = ph.split(" — ")[0].replace("Product Hunt: ", "") if " — " in ph else ph[:60]
                snippet = ph.split(" — ")[-1].split(" (")[0] if " — " in ph else ""
                if is_relevant_to_idea(title, snippet, cleaned_idea):
                    raw_sources.append({"title": title, "url": ph_url, "snippet": snippet[:200], "source_type": "producthunt", "score": 95})

    raw_sources.sort(key=lambda s: -s["score"])

    # Cap at MAX_RAW_SOURCES
    if len(raw_sources) > MAX_RAW_SOURCES:
        _log(f"  [Sources] Capped from {len(raw_sources)} to {MAX_RAW_SOURCES}")
        raw_sources = raw_sources[:MAX_RAW_SOURCES]

    return raw_sources


# ═══════════════════════════════════════
# Context Assembly
# ═══════════════════════════════════════

def assemble_deep_context(
    tavily_results: list[dict], github_readmes: dict[str, str],
    ph_results: list[str], deep_pages: dict[str, str],
    max_chars: int = 12000,
) -> str:
    github_budget = int(max_chars * 0.30)
    competitor_budget = int(max_chars * 0.50)
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