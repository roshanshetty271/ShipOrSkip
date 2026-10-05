import pytest

from src.research.fetcher import is_blocked, url_score


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
