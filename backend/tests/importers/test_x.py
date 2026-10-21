"""X archive importer, against the synthetic samples in samples/x (see samples/README.md)."""

import io
import zipfile
from datetime import UTC, datetime
from pathlib import Path

import pytest

from app.importers.common import ImportFormatError
from app.importers.x import parse_x

X = Path(__file__).resolve().parents[3] / "samples" / "x"
BROKEN = X.parent / "broken"


def archive(*names: str, extra: dict[str, bytes] | None = None) -> bytes:
    """A ZIP shaped like the one X emails: files under data/."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        for n in names:
            z.writestr(f"data/{n}", (X / n).read_bytes())
        for n, data in (extra or {}).items():
            z.writestr(n, data)
    return buf.getvalue()


FULL = archive("tweets.js", "note-tweet.js", "account.js")
AUG_30 = datetime(2026, 8, 30, tzinfo=UTC)


def by_id(result):
    return {p.external_id[-2:]: p for p in result.posts}


def test_the_archive_keeps_own_posts_and_threads_and_skips_replies_and_reposts():
    r = parse_x(FULL, now=AUG_30)
    assert sorted(by_id(r)) == ["01", "02", "05", "06", "07", "08", "09"]
    assert r.skipped == {"reply": 1, "repost": 1}


def test_a_long_post_gets_its_full_text_from_note_tweet_js():
    post = by_id(parse_x(FULL, now=AUG_30))["08"]
    assert post.text.endswith("https://example.com/sam/utc-migration")
    assert "…" not in post.text and "t.co" not in post.text
    assert len(post.text) > 280


def test_threads_lose_the_leading_handle_and_text_is_unescaped_with_real_links():
    posts = by_id(parse_x(FULL, now=AUG_30))
    assert posts["07"].text.startswith("Part 2:")
    assert "&amp;" not in posts["02"].text and "&" in posts["02"].text
    assert "t.co" not in posts["02"].text


def test_photo_links_are_removed_and_likes_become_reactions():
    posts = by_id(parse_x(FULL, now=AUG_30))
    assert posts["09"].text == "New dashboard for the CSV cleaner, dark mode included"
    assert posts["01"].reactions == 14
    assert posts["01"].posted_at == datetime(2026, 8, 2, 10, 15, tzinfo=UTC)


def test_a_recent_long_post_hints_premium_and_an_old_one_doesnt():
    assert parse_x(FULL, now=AUG_30).premium_hint is True
    assert parse_x(FULL, now=datetime(2027, 6, 1, tzinfo=UTC)).premium_hint is False
    assert parse_x(archive("tweets.js", "account.js"), now=AUG_30).premium_hint is False


def test_without_account_js_every_reply_is_skipped():
    r = parse_x((X / "tweets.js").read_bytes(), now=AUG_30)  # a bare tweets.js
    assert "07" not in by_id(r) and r.skipped["reply"] == 2


def test_only_the_post_files_are_read():
    """FR-39: other archive files (DMs…) are never opened, even if broken."""
    r = parse_x(archive("tweets.js", extra={"data/direct-messages.js": b"\xff not js"}))
    assert len(r.posts) == 6


def test_excluded_hashtags_skip_a_post():
    r = parse_x(FULL, excluded_hashtags=["#buildinpublic"], now=AUG_30)
    assert "06" not in by_id(r) and r.skipped["excluded_topic"] == 1


@pytest.mark.parametrize(
    ("data", "message"),
    [
        ((BROKEN / "x_no_wrapper.js").read_bytes(), "isn't from an X archive"),
        (b"PK\x03\x04 not really a zip", "damaged"),
        (archive("account.js"), "no data/tweets.js"),
        (b"window.YTD.tweets.part0 = {oops", "isn't readable"),
    ],
)
def test_broken_files_are_rejected_with_a_readable_message(data, message):
    with pytest.raises(ImportFormatError, match=message):
        parse_x(data)
