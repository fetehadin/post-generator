"""LinkedIn data export → the user's own posts (FR-1, FR-2, FR-39).

Accepts the export ZIP as LinkedIn emails it, or its Shares.csv on its own. From the ZIP we
read only Shares.csv; the profile, connections, messages and the rest are never opened.

Format traps (samples/README.md): ShareCommentary has newlines, commas and doubled quotes
inside quoted fields (use the csv module), an empty ShareCommentary is a reshare with no
comment, Date has no time zone (treated as UTC, OPEN_QUESTIONS Q15), there are no engagement
numbers, and there is no post id: it's taken from ShareLink.
"""

import csv
import hashlib
import io
import re
import zipfile
from collections.abc import Iterable
from datetime import UTC, datetime

from app.importers.common import (
    DEFAULT_EXCLUDED_HASHTAGS,
    MIN_TEXT_LENGTH,
    ImportFormatError,
    ParsedPost,
    ParseResult,
    normalize_hashtags,
)

REQUIRED = {"Date", "ShareLink", "ShareCommentary"}
SHARE_ID = re.compile(r"urn(?:%3A|:)li(?:%3A|:)(?:share|activity|ugcPost)(?:%3A|:)(\d+)")
# Some exports mark hashtags up as {hashtag|\#|python}; the post shows "#python".
HASHTAG_MARKUP = re.compile(r"\{hashtag\|\\?#\|([^}]+)\}")
HASHTAG = re.compile(r"#[^\s#.,!?;:]+")
LETTER = re.compile(r"[^\W\d_]", re.UNICODE)
URL = re.compile(r"https?://\S+")

MISSING_POSTS = (
    "This LinkedIn export has no Shares.csv, so it has no posts. In LinkedIn, go to "
    "Settings → Data privacy → Get a copy of your data, choose the larger archive "
    "(or tick Posts), and upload that ZIP."
)


def parse_linkedin(
    data: bytes, excluded_hashtags: Iterable[str] = DEFAULT_EXCLUDED_HASHTAGS
) -> ParseResult:
    rows = _rows(_shares_csv(data))
    excluded = normalize_hashtags(excluded_hashtags)
    result = ParseResult(posts=[])
    seen: set[str] = set()

    for row in rows:
        text = HASHTAG_MARKUP.sub(r"#\1", (row.get("ShareCommentary") or "")).strip()
        text = re.sub(r"\n{3,}", "\n\n", text.replace("\r\n", "\n"))
        if not text:
            result.skipped["repost"] += 1  # a reshare with no comment of your own
            continue
        if not LETTER.search(URL.sub("", text)):
            result.skipped["link_only"] += 1
            continue
        if len(text) < MIN_TEXT_LENGTH:
            result.skipped["too_short"] += 1
            continue
        if excluded and normalize_hashtags(HASHTAG.findall(text)) & excluded:
            result.skipped["excluded_topic"] += 1
            continue
        posted_at = _date(row.get("Date"))
        link = (row.get("ShareLink") or "").strip()
        if posted_at is None or not link:
            result.skipped["invalid"] += 1
            continue
        external_id = _external_id(link)
        if external_id in seen:
            result.skipped["duplicate"] += 1
            continue
        seen.add(external_id)
        # Shares.csv has no likes or comments, so every post starts equal (reactions 0).
        result.posts.append(ParsedPost(external_id=external_id, text=text, posted_at=posted_at))
    return result


def _shares_csv(data: bytes) -> bytes:
    if data[:2] != b"PK":
        return data
    try:
        archive = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile as e:
        raise ImportFormatError(
            "This ZIP file is damaged. Download your LinkedIn export again."
        ) from e
    shares = [n for n in archive.namelist() if n.rsplit("/", 1)[-1].lower() == "shares.csv"]
    if not shares:
        raise ImportFormatError(MISSING_POSTS)
    return archive.read(shares[0])


def _rows(raw: bytes) -> list[dict[str, str]]:
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError as e:
        raise ImportFormatError(
            "This file isn't readable text. Upload Shares.csv or the ZIP."
        ) from e
    reader = csv.DictReader(io.StringIO(text, newline=""))
    columns = set(reader.fieldnames or [])
    if not REQUIRED <= columns:
        raise ImportFormatError(
            "This isn't LinkedIn's Shares.csv (it needs the Date, ShareLink and ShareCommentary "
            "columns). Upload the LinkedIn export ZIP, or Shares.csv from it."
        )
    try:
        return list(reader)
    except csv.Error as e:
        raise ImportFormatError(
            "Shares.csv is damaged. Download your LinkedIn export again."
        ) from e


def _external_id(link: str) -> str:
    match = SHARE_ID.search(link)
    if match:
        return match.group(1)
    return "link-" + hashlib.sha1(link.encode()).hexdigest()[:20]


def _date(value: str | None) -> datetime | None:
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d"):
        try:
            return datetime.strptime((value or "").strip(), fmt).replace(tzinfo=UTC)
        except ValueError:
            continue
    return None
