import pytest

from src.research.fetcher import is_blocked, is_title_blocked, url_score


@pytest.mark.parametrize("url", [
    "https://www.microsoft.com/en-us/microsoft-365/microsoft-to-do-list-app",
    "https://www.netflix.com/",
    "https://www.dropbox.com/features",
    "https://box.com/",
    "https://www.wix.com/",
    "https://www.fedex.com/",
    "https://www.linux.com/",
    "https://www.lyft.com/",
    "https://habitica.com/",
])
def test_lookalike_domains_are_not_blocked(url):
    assert not is_blocked(url)


@pytest.mark.parametrize("url", [
    "https://x.com/someone/status/1",
    "https://twitter.com/someone",
    "https://ft.com/content/abc",
    "https://www.ft.com/content/abc",
    "https://blog.medium.com/post",
    "https://en.wikipedia.org/wiki/Habit",
    "https://m.youtube.com/watch?v=1",
    "https://a.b.c.alternativeto.com/software/x",
    "https://play.google.com/store/apps/details?id=x",
])
def test_listed_domains_and_subdomains_are_blocked(url):
    assert is_blocked(url)


def test_high_value_domains_match_on_label_boundary():
    assert url_score("https://www.reddit.com/r/SideProject/comments/x/y") == 80
    assert url_score("https://notreddit.com/a/b/c") == 30


def test_alternativeto_net_is_blocked():
    assert is_blocked("https://alternativeto.net/software/habitica/")


@pytest.mark.parametrize("title", [
    "The 7 best habit tracker apps in 2025",
    "the 10 best to-do list apps",
    "Habitica Alternatives",
    "Notion Alternatives: 12 tools to try",
    "Todoist Alternatives | Product Hunt",
    "9 Best Habit Tracker Apps",
])
def test_listicle_titles_are_blocked(title):
    assert is_title_blocked(title)


@pytest.mark.parametrize("title", [
    "Habitica - Gamify Your Life",
    "Loop Habit Tracker",
    "Streaks | Product Hunt",
    "AlternativeTo - Crowdsourced software recommendations",
    "Alternatives Inc: a habit app for teams",
    "The best way to keep a streak with friends",
    "Show HN: A habit tracker you share with one friend",
])
def test_product_titles_still_pass(title):
    assert not is_title_blocked(title)


@pytest.mark.parametrize("path", [
    "topics/habit-tracker", "search?q=habit", "trending/python", "explore/x",
    "orgs/acme/repositories", "marketplace/actions", "sponsors/someone",
    "features/actions", "collections/productivity-tools",
])
def test_github_site_pages_are_not_scored_as_repos(path):
    assert url_score(f"https://github.com/{path}") == 80


def test_github_repo_scores_highest():
    assert url_score("https://github.com/iSoron/uhabits") == 100
