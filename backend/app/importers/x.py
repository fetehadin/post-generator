"""X (Twitter) archive → the user's own posts (FR-1, FR-2, FR-39, OPEN_QUESTIONS Q11, Q12, Q31).

Accepts the archive ZIP as downloaded from X, or a bare tweets.js. From the ZIP we read only:
- data/tweets.js and data/tweets-part*.js (the posts),
- data/note-tweet.js (the full text of long Premium posts; tweets.js keeps a cut-off copy),
- data/account.js, for the account id only (to tell your threads from replies to others).
Everything else in the archive (DMs, ads, contacts…) is never opened.

Format traps (samples/README.md): the files are JavaScript (`window.YTD… = [`), numbers are
strings, `full_text` is HTML-escaped and uses t.co links, times look like
`Wed Aug 05 18:40:00 +0000 2026`.
"""

import html
import io
import json
import re
import zipfile
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from app.counting import x_weighted_length
from app.importers.common import (
    DEFAULT_EXCLUDED_HASHTAGS,
    MIN_TEXT_LENGTH,
    ImportFormatError,
    ParsedPost,
    ParseResult,
    normalize_hashtags,
)

TCO = re.compile(r"https://t\.co/\w+")
LEADING_MENTIONS = re.compile(r"^(?:@\w+\s+)+")
HASHTAG = re.compile(r"#[^\s#.,!?;:]+")
LETTER = re.compile(r"[^\W\d_]", re.UNICODE)
URL = re.compile(r"https?://\S+")
TWEET_FILES = re.compile(r"^data/tweets(?:-part\d+)?\.js$")
PREMIUM_WINDOW = timedelta(days=90)  # a long post this recent suggests Premium is still on


@dataclass(frozen=True)
class _Note:
    created: datetime
    text: str


def parse_x(
    data: bytes,
    excluded_hashtags: Iterable[str] = DEFAULT_EXCLUDED_HASHTAGS,
    now: datetime | None = None,
) -> ParseResult:
    tweets, notes, account_id = _read_archive(data)
    excluded = normalize_hashtags(excluded_hashtags)
    result = ParseResult(posts=[])
    seen: set[str] = set()
    long_post_at: datetime | None = None

    for item in tweets:
        tweet = item.get("tweet") if isinstance(item, dict) else None
        if not isinstance(tweet, dict) or not tweet.get("id_str"):
            result.skipped["invalid"] += 1
            continue
        raw = str(tweet.get("full_text", ""))
        if raw.startswith("RT @") or tweet.get("retweeted") is True:
            result.skipped["repost"] += 1
            continue
        if tweet.get("in_reply_to_status_id_str"):
            # Q11: a thread is a reply to yourself and stays; replies to others don't.
            if not account_id or tweet.get("in_reply_to_user_id_str") != account_id:
                result.skipped["reply"] += 1
                continue

        posted_at = _created_at(tweet.get("created_at"))
        if posted_at is None:
            result.skipped["invalid"] += 1
            continue
        note = _matching_note(raw, posted_at, notes)
        text = _clean(note.text if note else raw, tweet, from_note=note is not None)

        if not text:
            result.skipped["empty"] += 1
            continue
        if not LETTER.search(URL.sub("", text)):
            result.skipped["link_only"] += 1
            continue
        if len(text) < MIN_TEXT_LENGTH:
            result.skipped["too_short"] += 1
            continue
        if excluded and _hashtags(tweet, text) & excluded:
            result.skipped["excluded_topic"] += 1
            continue
        if tweet["id_str"] in seen:
            result.skipped["duplicate"] += 1
            continue
        seen.add(tweet["id_str"])

        if x_weighted_length(text) > 280:
            long_post_at = max(long_post_at or posted_at, posted_at)
        result.posts.append(
            ParsedPost(
                external_id=tweet["id_str"],
                text=text,
                posted_at=posted_at,
                reactions=_int(tweet.get("favorite_count")),
            )
        )

    # Q31: only Premium accounts can post over 280; a recent long post suggests Premium.
    result.premium_hint = bool(
        long_post_at and long_post_at >= (now or datetime.now(UTC)) - PREMIUM_WINDOW
    )
    return result


def _read_archive(data: bytes) -> tuple[list, list[_Note], str | None]:
    if data[:2] == b"PK":
        try:
            archive = zipfile.ZipFile(io.BytesIO(data))
        except zipfile.BadZipFile as e:
            raise ImportFormatError(
                "This ZIP file is damaged. Download your X archive again."
            ) from e
        names = archive.namelist()
        tweet_files = sorted(n for n in names if TWEET_FILES.match(n))
        if not tweet_files:
            raise ImportFormatError(
                "This ZIP has no data/tweets.js. Upload the archive X emailed you, unchanged."
            )
        tweets = [t for n in tweet_files for t in _ytd(archive.read(n), n)]
        notes = []
        if "data/note-tweet.js" in names:
            notes = [_note(n) for n in _ytd(archive.read("data/note-tweet.js"), "note-tweet.js")]
        account_id = None
        if "data/account.js" in names:
            acct = _ytd(archive.read("data/account.js"), "account.js")
            account_id = str(acct[0].get("account", {}).get("accountId") or "") or None
        return tweets, [n for n in notes if n], account_id
    return _ytd(data, "tweets.js"), [], None


def _ytd(raw: bytes, name: str) -> list:
    """X archive files are JavaScript: `window.YTD.<name>.part0 = [ ... ]`."""
    unreadable = f"{name} isn't readable. Upload the X archive ZIP, or its data/tweets.js file."
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError as e:
        raise ImportFormatError(unreadable) from e
    if not text.lstrip().startswith("window.YTD"):
        raise ImportFormatError(
            f"{name} isn't from an X archive. Upload the ZIP X emailed you, or its tweets.js."
        )
    try:
        value = json.loads(text[text.index("[") :])
    except ValueError as e:
        raise ImportFormatError(unreadable) from e
    if not isinstance(value, list):
        raise ImportFormatError(f"{name} doesn't contain a list of posts.")
    return value


def _note(item: object) -> _Note | None:
    note = item.get("noteTweet") if isinstance(item, dict) else None
    if not isinstance(note, dict):
        return None
    try:
        created = datetime.fromisoformat(str(note["createdAt"]).replace("Z", "+00:00"))
    except (KeyError, ValueError):
        return None
    core = note.get("core") or {}
    text = str(core.get("text", ""))
    for url in core.get("urls") or []:
        if url.get("shortUrl") and url.get("expandedUrl"):
            text = text.replace(url["shortUrl"], url["expandedUrl"])
    return _Note(created, text)


def _comparable(text: str) -> str:
    text = LEADING_MENTIONS.sub("", html.unescape(TCO.sub("", text)))
    return re.sub(r"\s+", " ", text).strip().rstrip("…").strip()


def _matching_note(raw: str, posted_at: datetime, notes: list[_Note]) -> _Note | None:
    """tweets.js keeps a cut-off copy of a long post; note-tweet.js has the whole text, with no
    id linking them. Match on the same second (±2 s) and the long text starting with the short."""
    short = _comparable(raw)
    if len(short) < 20:
        return None
    for note in notes:
        if abs((note.created - posted_at).total_seconds()) <= 2:
            if _comparable(note.text).startswith(short[:200]):
                return note
    return None


def _clean(text: str, tweet: dict, from_note: bool) -> str:
    text = html.unescape(text)
    if not from_note:
        entities = tweet.get("entities") or {}
        for url in entities.get("urls") or []:
            if url.get("url") and url.get("expanded_url"):
                text = text.replace(url["url"], url["expanded_url"])
        for media in (entities.get("media") or []) + (
            (tweet.get("extended_entities") or {}).get("media") or []
        ):
            if media.get("url"):  # the photo or video link X appends; the media itself isn't text
                text = text.replace(media["url"], "")
    text = LEADING_MENTIONS.sub("", text.strip())  # threads start with "@yourname"
    return re.sub(r"[ \t]+\n", "\n", text).strip()


def _hashtags(tweet: dict, text: str) -> set[str]:
    tags = {f"#{h.get('text', '')}" for h in (tweet.get("entities") or {}).get("hashtags") or []}
    return normalize_hashtags(tags | set(HASHTAG.findall(text)))


def _created_at(value: object) -> datetime | None:
    try:
        return datetime.strptime(str(value), "%a %b %d %H:%M:%S %z %Y").astimezone(UTC)
    except ValueError:
        return None


def _int(value: object) -> int:
    try:
        return int(str(value))
    except ValueError:
        return 0
