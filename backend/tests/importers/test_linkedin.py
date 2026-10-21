"""LinkedIn importer, against samples/linkedin/Shares.csv (see samples/README.md)."""

import io
import zipfile
from datetime import UTC, datetime
from pathlib import Path

import pytest

from app.importers.common import ImportFormatError
from app.importers.linkedin import parse_linkedin

SAMPLES = Path(__file__).resolve().parents[3] / "samples"
SHARES = (SAMPLES / "linkedin" / "Shares.csv").read_bytes()


def export_zip(files: dict[str, bytes]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        for name, data in files.items():
            z.writestr(name, data)
    return buf.getvalue()


def test_shares_csv_keeps_three_posts_and_skips_the_reshare():
    r = parse_linkedin(SHARES)
    assert [p.external_id for p in r.posts] == [
        "7300000000000000001",
        "7300000000000000002",
        "7300000000000000004",
    ]
    assert r.skipped == {"repost": 1}


def test_quotes_commas_and_newlines_survive():
    post = parse_linkedin(SHARES).posts[0]
    assert '"small numbers, real people"' in post.text
    assert "\n• a CSV cleaner" in post.text
    assert post.posted_at == datetime(2026, 8, 21, 8, 30, tzinfo=UTC)
    assert post.reactions == 0  # Shares.csv has no engagement numbers


def test_the_export_zip_works_and_only_shares_csv_is_read():
    data = export_zip(
        {
            "Shares.csv": SHARES,
            "Profile.csv": b"First Name\nSam",
            "messages.csv": b"\xff\xfe broken",
        }
    )
    assert len(parse_linkedin(data).posts) == 3


def test_an_export_without_posts_says_which_archive_to_request():
    """The two real exports the team downloaded first had only Profile.csv."""
    with pytest.raises(ImportFormatError, match="no Shares.csv"):
        parse_linkedin(export_zip({"Profile.csv": b"First Name\nSam"}))


def test_hashtag_markup_becomes_a_plain_hashtag_and_can_be_excluded():
    csv = (
        b"Date,ShareLink,ShareCommentary,SharedUrl,MediaUrl,Visibility\n"
        b"2026-08-01 10:00:00,https://www.linkedin.com/feed/update/urn:li:activity:99,"
        b'"Weekend with the {hashtag|\\#|family}, no laptop at all",,,MEMBER_NETWORK\n'
    )
    assert (
        parse_linkedin(csv, excluded_hashtags=[])
        .posts[0]
        .text.startswith("Weekend with the #family")
    )
    assert parse_linkedin(csv).skipped == {"excluded_topic": 1}


@pytest.mark.parametrize(
    ("data", "message"),
    [
        (
            (SAMPLES / "broken" / "linkedin_wrong_columns.csv").read_bytes(),
            "isn't LinkedIn's Shares.csv",
        ),
        (b"PK\x03\x04 nope", "damaged"),
        (b"\xff\xfe\x00\x00 binary", "isn't readable"),
    ],
)
def test_broken_files_are_rejected_with_a_readable_message(data, message):
    with pytest.raises(ImportFormatError, match=message):
        parse_linkedin(data)
