import json
from datetime import UTC, datetime
from pathlib import Path

import pytest

from app.importers.common import ImportFormatError
from app.importers.telegram import flatten_text, parse_telegram, tidy_text

SAMPLES = Path(__file__).resolve().parents[3] / "samples"
SAMPLE = SAMPLES / "telegram" / "result.json"


def export(*messages: dict) -> bytes:
    return json.dumps(
        {"name": "Test", "type": "public_channel", "id": 1, "messages": list(messages)}
    ).encode()


def msg(id: int, text, **extra) -> dict:
    return {
        "id": id,
        "type": "message",
        "date": "2026-08-02T10:15:00",
        "date_unixtime": "1785665700",
        "text": text,
        **extra,
    }


def test_sample_export_matches_samples_readme():
    result = parse_telegram(SAMPLE.read_bytes())
    assert [p.external_id for p in result.posts] == ["2", "3", "6", "7", "8"]
    assert result.skipped == {"service": 1, "empty": 1, "forwarded": 1}
    assert result.source_name == "Sam Builds"


def test_formatted_text_is_flattened():
    post = {p.external_id: p for p in parse_telegram(SAMPLE.read_bytes()).posts}["3"]
    assert post.text.startswith("Shipped v0.2 of the CSV cleaner.")
    assert "Code: the repo 🚀" in post.text


def test_posted_at_uses_unixtime_in_utc_not_local_date():
    raw = json.loads(SAMPLE.read_text())["messages"][1]
    post = parse_telegram(SAMPLE.read_bytes()).posts[0]
    assert post.posted_at == datetime.fromtimestamp(int(raw["date_unixtime"]), UTC)
    assert post.posted_at.tzinfo is UTC
    assert post.posted_at.hour != int(raw["date"][11:13])  # sample's local time is UTC+3


def test_excluded_hashtags_are_case_insensitive_and_counted():
    result = parse_telegram(SAMPLE.read_bytes(), excluded_hashtags=["BuildInPublic"])
    assert "8" not in [p.external_id for p in result.posts]
    assert result.skipped["excluded_topic"] == 1


def test_default_list_skips_personal_posts():
    data = export(msg(1, "Dinner with the family tonight #Family, back to code tomorrow"))
    result = parse_telegram(data)
    assert result.posts == []
    assert result.skipped["excluded_topic"] == 1


@pytest.mark.parametrize(
    ("text", "reason"),
    [
        ("https://www.youtube.com/watch?v=abc123", "link_only"),
        ("[Forwarded from Someone] A long post someone else wrote about Django.", "forwarded"),
        ("ok 👍", "too_short"),
        ("", "empty"),
    ],
)
def test_junk_posts_are_skipped_with_a_reason(text, reason):
    result = parse_telegram(export(msg(1, text)))
    assert result.posts == []
    assert result.skipped[reason] == 1


def test_duplicate_ids_are_kept_once():
    data = export(
        msg(1, "Shipped the parser today, all tests green."),
        msg(1, "Shipped the parser today, all tests green."),
    )
    result = parse_telegram(data)
    assert len(result.posts) == 1
    assert result.skipped["duplicate"] == 1


def test_reactions_are_summed():
    data = export(
        msg(
            1,
            "Shipped the parser today, all tests green.",
            reactions=[{"type": "emoji", "count": 5}, {"type": "emoji", "count": 3}],
        )
    )
    assert parse_telegram(data).posts[0].reactions == 8


def test_message_without_timestamp_is_invalid_not_a_crash():
    bad = msg(1, "Shipped the parser today, all tests green.")
    del bad["date_unixtime"]
    result = parse_telegram(export(bad))
    assert result.posts == [] and result.skipped["invalid"] == 1


@pytest.mark.parametrize(
    "name",
    [
        "telegram_truncated.json",
        "telegram_no_messages.json",
        "x_no_wrapper.js",
        "linkedin_wrong_columns.csv",
        "empty.json",
    ],
)
def test_broken_files_are_rejected_with_a_readable_message(name):
    with pytest.raises(ImportFormatError) as err:
        parse_telegram((SAMPLES / "broken" / name).read_bytes())
    assert len(str(err.value)) > 20


def test_full_account_export_gets_specific_advice():
    data = json.dumps({"about": "x", "chats": {"list": []}}).encode()
    with pytest.raises(ImportFormatError, match="full-account export"):
        parse_telegram(data)


def test_flatten_text_handles_both_shapes():
    assert flatten_text("plain") == "plain"
    assert flatten_text(["a ", {"type": "bold", "text": "b"}, " c"]) == "a b c"
    assert flatten_text(None) == ""


def test_tidy_text_removes_layout_tricks_only():
    raw = (
        "Join us!   #ALX"
        + " " * 60
        + "https://t.me/fetedev"
        + " " * 60
        + "https://t.me/fetedev\n\n\n\nBye 👋  "
    )
    assert tidy_text(raw) == "Join us! #ALX https://t.me/fetedev\n\nBye 👋"
    assert tidy_text("line one\nline two") == "line one\nline two"
    assert tidy_text("a.co https://a.co/x https://b.co") == "a.co https://a.co/x https://b.co"
