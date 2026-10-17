"""Telegram Desktop single-channel export (result.json) → the user's own posts.

Format traps are listed in samples/README.md: `text` is a string or a list of parts,
`date` is the exporter's local time (we use `date_unixtime`), forwards carry
`forwarded_from`, and some copied forwards only show "[Forwarded from …]" in the text.
"""

import json
import re
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

URL = re.compile(r"https?://\S+|t\.me/\S+")
LETTER = re.compile(r"[^\W\d_]", re.UNICODE)


def parse_telegram(
    data: bytes, excluded_hashtags: Iterable[str] = DEFAULT_EXCLUDED_HASHTAGS
) -> ParseResult:
    export = _load(data)
    excluded = normalize_hashtags(excluded_hashtags)
    result = ParseResult(posts=[], source_name=str(export.get("name") or ""))
    seen: set[str] = set()

    for msg in export["messages"]:
        if not isinstance(msg, dict):
            result.skipped["invalid"] += 1
            continue
        if msg.get("type") != "message":
            result.skipped["service"] += 1
            continue
        if "forwarded_from" in msg:
            result.skipped["forwarded"] += 1
            continue

        text = flatten_text(msg.get("text", "")).strip()
        if not text:
            result.skipped["empty"] += 1
            continue
        if text.startswith("[Forwarded from"):
            result.skipped["forwarded"] += 1
            continue
        if not LETTER.search(URL.sub("", text)):
            result.skipped["link_only"] += 1
            continue
        if len(text) < MIN_TEXT_LENGTH:
            result.skipped["too_short"] += 1
            continue
        if excluded and _hashtags(msg, text) & excluded:
            result.skipped["excluded_topic"] += 1
            continue

        external_id = str(msg.get("id", ""))
        posted_at = _posted_at(msg)
        if not external_id or posted_at is None:
            result.skipped["invalid"] += 1
            continue
        if external_id in seen:
            result.skipped["duplicate"] += 1
            continue
        seen.add(external_id)

        result.posts.append(
            ParsedPost(
                external_id=external_id,
                text=text,
                posted_at=posted_at,
                reactions=_reactions(msg),
            )
        )
    return result


def flatten_text(value: object) -> str:
    """`text` is either a plain string or a list of strings and {"type", "text"} parts."""
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        return "".join(
            part if isinstance(part, str) else str(part.get("text", ""))
            for part in value
            if isinstance(part, str | dict)
        )
    return ""


def _load(data: bytes) -> dict:
    if not data or not data.strip():
        raise ImportFormatError(
            "The file is empty. Export your channel again and upload result.json."
        )
    try:
        export = json.loads(data.decode("utf-8-sig"))
    except (UnicodeDecodeError, json.JSONDecodeError) as e:
        raise ImportFormatError(
            "This isn't a valid Telegram export: the file is cut off or not JSON. "
            "In Telegram Desktop choose Export chat history → format: JSON."
        ) from e
    if not isinstance(export, dict):
        raise ImportFormatError("This isn't a Telegram channel export (result.json).")
    if "chats" in export and "messages" not in export:
        raise ImportFormatError(
            "This is a full-account export. Export just one channel instead: open the channel "
            "in Telegram Desktop → ⋮ → Export chat history."
        )
    if not isinstance(export.get("messages"), list):
        raise ImportFormatError(
            "This file has no messages list. Upload the result.json of a channel."
        )
    return export


def _posted_at(msg: dict) -> datetime | None:
    raw = msg.get("date_unixtime")
    try:
        return datetime.fromtimestamp(int(raw), UTC)
    except (TypeError, ValueError, OverflowError, OSError):
        return None


def _hashtags(msg: dict, text: str) -> set[str]:
    tags = {
        str(e.get("text", "")).lower()
        for e in msg.get("text_entities", [])
        if isinstance(e, dict) and e.get("type") == "hashtag"
    }
    # Fallback for exports without entities.
    tags |= {t.lower() for t in re.findall(r"#[^\s#.,!?;:()\[\]]+", text)}
    return tags


def _reactions(msg: dict) -> int:
    total = 0
    for r in msg.get("reactions") or []:
        if isinstance(r, dict):
            try:
                total += int(r.get("count", 0))
            except (TypeError, ValueError):
                pass
    return total
