"""Drafts after they're written: the library, the editor's data, hand edits, versions and the
status rules (FR-9, FR-10, FR-11, FR-12, FR-13).

Status moves: draft ⇄ approved → published, and draft/approved → discarded → draft.
- Only a draft's text can change; approve it again after editing.
- Approve is refused while the text is over the platform's limit (FR-9).
- A time on the calendar needs approval first (CLAUDE.md rule 4).
- "Posted" (published) is only for approved drafts and is final.
"""

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from difflib import SequenceMatcher

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import distinct_on

from app.core.db import user_session
from app.counting import post_length
from app.models import Draft, DraftMessage, DraftVersion, PlatformProfile, SourcePost, Thread
from app.services.drafting import DraftError
from app.services.voice import effective_limit

HAND_EDIT = "Edited by hand"
PAST_GRACE = timedelta(minutes=5)  # a time picked "now" is still fine a moment later


@dataclass(frozen=True)
class Length:
    count: int
    limit: int

    @property
    def over(self) -> bool:
        return self.count > self.limit


@dataclass(frozen=True)
class DraftRow:
    draft: Draft
    text: str
    length: Length
    updated_at: datetime


@dataclass(frozen=True)
class DraftDetail(DraftRow):
    versions: list[DraftVersion]
    messages: list[DraftMessage]


def _limits(user_id: uuid.UUID) -> tuple[dict[str, PlatformProfile], dict[str, int]]:
    with user_session(user_id) as s:
        rules = {p.platform: p for p in s.scalars(select(PlatformProfile)).all()}
        s.expunge_all()
    return rules, {name: effective_limit(user_id, p) for name, p in rules.items()}


def _latest_versions(s, draft_ids: list[uuid.UUID]) -> dict[uuid.UUID, DraftVersion]:
    if not draft_ids:
        return {}
    rows = s.scalars(
        select(DraftVersion)
        .where(DraftVersion.draft_id.in_(draft_ids))
        .ext(distinct_on(DraftVersion.draft_id))
        .order_by(DraftVersion.draft_id, DraftVersion.created_at.desc())
    ).all()
    return {v.draft_id: v for v in rows}


def list_drafts(
    user_id: uuid.UUID,
    status: str | None = None,
    platform: str | None = None,
    scheduled_from: datetime | None = None,
    scheduled_to: datetime | None = None,
    created_from: datetime | None = None,
    limit: int = 100,
) -> list[DraftRow]:
    rules, limits = _limits(user_id)
    with user_session(user_id) as s:
        q = select(Draft).where(Draft.user_id == user_id)
        if status:
            q = q.where(Draft.status == status)
        if platform:
            q = q.where(Draft.platform == platform)
        if scheduled_from:
            q = q.where(Draft.scheduled_for >= scheduled_from)
        if scheduled_to:
            q = q.where(Draft.scheduled_for < scheduled_to)
        if created_from:
            q = q.where(Draft.created_at >= created_from)
        order = Draft.scheduled_for if scheduled_from or scheduled_to else Draft.created_at.desc()
        drafts = s.scalars(q.order_by(order).limit(limit)).all()
        latest = _latest_versions(s, [d.id for d in drafts])
        s.expunge_all()
    return [_row(d, latest[d.id], rules, limits) for d in drafts if d.id in latest]


def _row(d: Draft, v: DraftVersion, rules, limits) -> DraftRow:
    count = post_length(v.text, rules[d.platform].counting_rule)
    return DraftRow(d, v.text, Length(count, limits[d.platform]), v.created_at)


def detail(user_id: uuid.UUID, draft_id: uuid.UUID) -> DraftDetail:
    rules, limits = _limits(user_id)
    with user_session(user_id) as s:
        d = s.get(Draft, draft_id)
        if d is None:  # RLS hides other users' drafts, so this is also "not yours" (FR-29)
            raise DraftError("not_found", "Not found.", 404)
        versions = s.scalars(
            select(DraftVersion)
            .where(DraftVersion.draft_id == draft_id)
            .order_by(DraftVersion.created_at)
        ).all()
        messages = s.scalars(  # the chat lines; a generated card has no text of its own
            select(DraftMessage)
            .where(DraftMessage.draft_id == draft_id, DraftMessage.text != "")
            .order_by(DraftMessage.created_at)
        ).all()
        s.expunge_all()
    row = _row(d, versions[-1], rules, limits)
    return DraftDetail(
        row.draft, row.text, row.length, row.updated_at, list(versions), list(messages)
    )


def add_version(
    s, user_id: uuid.UUID, draft: Draft, text: str, instruction: str, model: str | None = None
) -> DraftVersion:
    version = DraftVersion(
        user_id=user_id, draft_id=draft.id, text=text, instruction=instruction, model=model
    )
    s.add(version)
    s.flush()
    return version


def add_card(s, user_id: uuid.UUID, draft: Draft, version: DraftVersion, note: str) -> None:
    """A version made outside the chat (a hand edit, a restore) still shows in the thread as a
    new card, so the thread tells the whole story (FR-46)."""
    s.add(
        DraftMessage(
            user_id=user_id,
            thread_id=draft.thread_id,
            draft_id=draft.id,
            role="user",
            text=note,
            draft_version_id=version.id,
        )
    )
    if draft.thread_id is not None:
        s.get(Thread, draft.thread_id).updated_at = datetime.now(UTC)


def update(user_id: uuid.UUID, draft_id: uuid.UUID, changes: dict) -> DraftDetail:
    """PATCH /drafts/{id}: text, status and scheduled_for, with the rules in the docstring."""
    current = detail(user_id, draft_id)  # 404 first
    with user_session(user_id) as s:
        d = s.get(Draft, draft_id)
        text = changes.get("text")
        if text is not None and not text.strip():
            raise DraftError("missing_text", "A post can't be empty.")
        if text is not None and text.strip() != current.text:
            if d.status != "draft":
                raise DraftError(
                    "not_editable", "Move it back to draft before you change the text.", 409
                )
            add_card(s, user_id, d, add_version(s, user_id, d, text.strip(), HAND_EDIT), HAND_EDIT)

        status = changes.get("status")
        if status and status != d.status:
            _move(d, status, current, text)
            if status == "published":
                _learn_from(s, user_id, d, current.text)

        if "scheduled_for" in changes:
            when = changes["scheduled_for"]
            if when is not None:
                if d.status != "approved":
                    raise DraftError(
                        "not_approved", "Approve the draft before you schedule it.", 409
                    )
                if when < datetime.now(UTC) - PAST_GRACE:
                    raise DraftError("in_the_past", "Pick a time that hasn't passed yet.")
            d.scheduled_for = when
    return detail(user_id, draft_id)


def _move(d: Draft, status: str, current: DraftDetail, new_text: str | None) -> None:
    if d.status == "published":
        raise DraftError("already_published", "This post is already published.", 409)
    if status == "approved":
        if new_text is not None and new_text.strip() != current.text:
            raise DraftError("not_editable", "Save the text first, then approve it.", 409)
        if current.length.over:
            over = current.length.count - current.length.limit
            raise DraftError("over_limit", f"Cut {over} characters before approving.", 409)
    elif status == "published":
        if d.status != "approved":
            raise DraftError("not_approved", "Approve the draft before marking it posted.", 409)
        d.published_at = datetime.now(UTC)
    elif status in ("draft", "discarded"):
        d.scheduled_for = None  # back to editing or thrown away: off the calendar
    d.status = status


def _learn_from(s, user_id: uuid.UUID, d: Draft, text: str) -> None:
    """A post the user published is now one of their own posts: it joins the voice examples
    (origin "voxlace"). Its embedding is NULL, so the embedding queue picks it up."""
    s.add(
        SourcePost(
            user_id=user_id,
            platform=d.platform,
            origin="voxlace",
            external_id=f"voxlace:{d.id}",
            text=text,
            posted_at=d.published_at,
        )
    )


def delete_forever(user_id: uuid.UUID, draft_id: uuid.UUID) -> None:
    """Delete a discarded draft for good: its versions, chat cards and prompt logs go too.
    Only discarded drafts, so a delete is always two deliberate steps."""
    with user_session(user_id) as s:
        d = s.get(Draft, draft_id)
        if d is None:
            raise DraftError("not_found", "Not found.", 404)
        if d.status != "discarded":
            raise DraftError("not_discarded", "Discard the draft first.", 409)
        s.delete(d)


def restore(user_id: uuid.UUID, draft_id: uuid.UUID, version_id: uuid.UUID) -> DraftDetail:
    """FR-10: bring an earlier version back as the newest one."""
    current = detail(user_id, draft_id)
    numbers = {v.id: i for i, v in enumerate(current.versions, 1)}
    if version_id not in numbers:
        raise DraftError("not_found", "Not found.", 404)
    with user_session(user_id) as s:
        d = s.get(Draft, draft_id)
        if d.status != "draft":
            raise DraftError("not_editable", "Move it back to draft before you restore.", 409)
        old = s.get(DraftVersion, version_id)
        note = f"Restored v{numbers[version_id]}"
        add_card(s, user_id, d, add_version(s, user_id, d, old.text, note), note)
    return detail(user_id, draft_id)


@dataclass(frozen=True)
class Stats:
    created: int
    published: int
    edited: float | None  # 0–1: how much published posts changed from the first draft

    @property
    def publish_rate(self) -> float | None:
        return round(self.published / self.created, 2) if self.created else None


def edit_amount(first: str, final: str) -> float:
    """0 = published as written, 1 = completely rewritten (by hand or by chat)."""
    return round(1 - SequenceMatcher(None, first, final, autojunk=False).ratio(), 2)


def stats(user_id: uuid.UUID, days: int = 7) -> Stats:
    """FR-15: of the drafts written in the last `days`, how many were posted, and how much
    they were edited first. Discarded drafts count as written, not posted."""
    since = datetime.now(UTC) - timedelta(days=days)
    with user_session(user_id) as s:
        drafts = s.scalars(
            select(Draft).where(Draft.user_id == user_id, Draft.created_at >= since)
        ).all()
        published = [d for d in drafts if d.status == "published"]
        edits = []
        for d in published:
            texts = s.scalars(
                select(DraftVersion.text)
                .where(DraftVersion.draft_id == d.id)
                .order_by(DraftVersion.created_at)
            ).all()
            edits.append(edit_amount(texts[0], texts[-1]))
    edited = round(sum(edits) / len(edits), 2) if edits else None
    return Stats(len(drafts), len(published), edited)
