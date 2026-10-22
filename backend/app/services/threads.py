"""The chat board (FR-40, FR-46): one thread per conversation, ChatGPT-style.

A thread starts with what the user did today (saved as that day's check-in). Generate adds
one draft card per platform. Every reply that changes a draft adds a new full card, and
"make a LinkedIn version" adds a card for another platform. The thread is read back as one
ordered list of messages; a message that points at a draft version is a card.
"""

import uuid
from dataclasses import dataclass
from datetime import date

from sqlalchemy import select

from app.ai.client import AIClient, AIUnavailable, EmbeddingUnavailable
from app.core.db import user_session
from app.models import Checkin, Draft, DraftMessage, DraftVersion, Thread
from app.services import library
from app.services.clock import local_today
from app.services.drafting import PLATFORM_NAMES, DraftError, generate_draft, thread_title

AI_BUSY = "The AI service is busy right now. Try again in a minute."


@dataclass(frozen=True)
class ThreadRow:
    thread: Thread
    platforms: list[str]


@dataclass(frozen=True)
class Card:
    """One draft version as it appears in the thread."""

    version_id: uuid.UUID
    number: int
    text: str
    length: library.Length


@dataclass(frozen=True)
class ThreadDetail:
    thread: Thread
    checkin_text: str
    messages: list[tuple[DraftMessage, Card | None]]
    drafts: list[library.DraftRow]


@dataclass(frozen=True)
class Failure:
    platform: str
    code: str
    message: str


def start(user_id: uuid.UUID, text: str, day: date | None = None) -> ThreadDetail:
    """ "Save" on the chat board: the text becomes that day's check-in and opens a thread."""
    text = text.strip()
    if not text:
        raise DraftError("missing_text", "Write what you did today first.")
    with user_session(user_id) as s:
        checkin = Checkin(user_id=user_id, day=day or local_today(s, user_id), text=text)
        s.add(checkin)
        s.flush()
        thread = Thread(user_id=user_id, title=thread_title(text), checkin_id=checkin.id)
        s.add(thread)
        s.flush()
        s.add(DraftMessage(user_id=user_id, thread_id=thread.id, role="user", text=text))
        thread_id = thread.id
    return detail(user_id, thread_id)


def list_threads(user_id: uuid.UUID, limit: int = 50) -> list[ThreadRow]:
    with user_session(user_id) as s:
        threads = s.scalars(
            select(Thread)
            .where(Thread.user_id == user_id)
            .order_by(Thread.updated_at.desc())
            .limit(limit)
        ).all()
        platforms: dict[uuid.UUID, list[str]] = {}
        if threads:
            rows = s.execute(
                select(Draft.thread_id, Draft.platform)
                .where(Draft.thread_id.in_([t.id for t in threads]))
                .distinct()
            ).all()
            for thread_id, platform in rows:
                platforms.setdefault(thread_id, []).append(platform)
        s.expunge_all()
    order = list(PLATFORM_NAMES)
    return [ThreadRow(t, sorted(platforms.get(t.id, []), key=order.index)) for t in threads]


def detail(user_id: uuid.UUID, thread_id: uuid.UUID) -> ThreadDetail:
    rules, limits = library._limits(user_id)
    with user_session(user_id) as s:
        thread = s.get(Thread, thread_id)
        if thread is None:  # RLS: another user's thread is simply not found (FR-29)
            raise DraftError("not_found", "Not found.", 404)
        checkin = s.get(Checkin, thread.checkin_id) if thread.checkin_id else None
        messages = s.scalars(
            select(DraftMessage)
            .where(DraftMessage.thread_id == thread_id)
            .order_by(DraftMessage.created_at, DraftMessage.id)
        ).all()
        drafts = s.scalars(
            select(Draft).where(Draft.thread_id == thread_id).order_by(Draft.created_at)
        ).all()
        versions = s.scalars(
            select(DraftVersion)
            .where(DraftVersion.draft_id.in_([d.id for d in drafts]))
            .order_by(DraftVersion.created_at)
        ).all()
        s.expunge_all()

    by_draft = {d.id: d for d in drafts}
    numbered: dict[uuid.UUID, tuple[int, DraftVersion]] = {}
    counts: dict[uuid.UUID, int] = {}
    latest: dict[uuid.UUID, DraftVersion] = {}
    for v in versions:
        counts[v.draft_id] = counts.get(v.draft_id, 0) + 1
        numbered[v.id] = (counts[v.draft_id], v)
        latest[v.draft_id] = v

    out = []
    for m in messages:
        card = None
        if m.draft_version_id in numbered and m.draft_id in by_draft:
            number, v = numbered[m.draft_version_id]
            row = library._row(by_draft[m.draft_id], v, rules, limits)
            card = Card(v.id, number, v.text, row.length)
        out.append((m, card))
    rows = [library._row(d, latest[d.id], rules, limits) for d in drafts if d.id in latest]
    return ThreadDetail(thread, checkin.text if checkin else thread.title, out, rows)


def generate(
    user_id: uuid.UUID, thread_id: uuid.UUID, platforms: list[str], ai: AIClient | None = None
) -> tuple[ThreadDetail, list[Failure]]:
    """One card per platform, from the thread's check-in. A platform that fails (no posts
    yet, the daily limit) doesn't stop the others; it comes back as a failure to show."""
    current = detail(user_id, thread_id)
    topic = current.checkin_text
    failures: list[Failure] = []
    for platform in dict.fromkeys(platforms):  # each platform once, in the order asked
        try:
            generate_draft(
                user_id,
                platform,
                topic,
                ai=ai,
                checkin_id=current.thread.checkin_id,
                thread_id=thread_id,
            )
        except DraftError as e:
            failures.append(Failure(platform, e.code, e.message))
        except (AIUnavailable, EmbeddingUnavailable):
            failures.append(Failure(platform, "ai_unavailable", AI_BUSY))
    return detail(user_id, thread_id), failures


def convert(
    user_id: uuid.UUID, draft_id: uuid.UUID, platform: str, ai: AIClient | None = None
) -> ThreadDetail:
    """FR-40: the same post for another platform, as a new draft in the same thread. The
    original stays as it is."""
    source = library.detail(user_id, draft_id)
    d = source.draft
    if platform == d.platform:
        raise DraftError("same_platform", "Pick a different platform.")
    if d.thread_id is None:
        raise DraftError("not_found", "Not found.", 404)
    with user_session(user_id) as s:
        s.add(
            DraftMessage(
                user_id=user_id,
                thread_id=d.thread_id,
                draft_id=d.id,
                role="user",
                text=f"Make a {PLATFORM_NAMES[platform]} version",
            )
        )
    generate_draft(
        user_id,
        platform,
        d.topic,
        ai=ai,
        checkin_id=d.checkin_id,
        thread_id=d.thread_id,
        adapt_from=source.text,
        source_draft_id=d.id,
    )
    return detail(user_id, d.thread_id)
