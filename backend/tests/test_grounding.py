from src.research.fetcher import filter_grounded_competitors

CONTEXT = """## Competitor Pages (Full Content)
### https://www.habitica.com/
Habitica turns habits into a role-playing game.

## Market Context (Snippets)
- Streaks | Product Hunt (https://www.producthunt.com/products/streaks): a to-do list app
- Show HN (https://news.ycombinator.com/item?id=1): HabitShare lets friends see each other's habits
"""

RAW_SOURCES = [{"url": "https://github.com/iSoron/uhabits", "title": "iSoron/uhabits"}]


def _c(name, url=""):
    return {"name": name, "url": url, "description": "", "threat_level": "medium"}


def test_keeps_competitor_whose_host_is_in_context():
    kept = filter_grounded_competitors([_c("Gamified habits", "https://habitica.com/pricing")], CONTEXT, [])
    assert len(kept) == 1


def test_keeps_competitor_whose_host_is_in_raw_sources():
    kept = filter_grounded_competitors([_c("Loop", "https://www.github.com/iSoron/uhabits")], "", RAW_SOURCES)
    assert len(kept) == 1


def test_keeps_competitor_named_in_context_case_insensitive():
    kept = filter_grounded_competitors([_c("habitshare", "https://habitshare.app")], CONTEXT, [])
    assert len(kept) == 1


def test_drops_competitor_missing_from_search_data():
    competitors = [_c("HabitHub Pro", "https://habithub.pro"), _c("Habitica", "https://habitica.com")]
    kept = filter_grounded_competitors(competitors, CONTEXT, RAW_SOURCES)
    assert [c["name"] for c in kept] == ["Habitica"]


def test_host_must_match_whole_domain():
    # "x.com" is a substring of "netflix.com" but not the same site.
    kept = filter_grounded_competitors([_c("Unknown", "https://x.com/app")], "see https://netflix.com/", [])
    assert kept == []


def test_empty_url_and_name_are_not_grounded():
    assert filter_grounded_competitors([_c("", "")], CONTEXT, RAW_SOURCES) == []
