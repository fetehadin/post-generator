"""Export and delete everything a user has in Voxlace (FR-38, NFR-10).

Export is plain JSON the user can read: their words, not our internals (no embeddings).
Delete removes the users row; every user-owned table cascades from it. The login account
lives at Supabase and is not touched here: without our data it can't do anything, and the
user can be invited again.
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy import select

from app.core.db import user_session
from app.models import (
    Checkin,
    Draft,
    DraftMessage,
    DraftVersion,
    PlatformSettings,
    Profile,
    ReminderSettings,
    SourcePost,
    Thread,
    User,
    VoiceCard,
)
from app.services.profile import FIELDS


def _iso(dt: datetime | None) -> str | None:
    return dt.isoformat() if dt else None


def export_all(user_id: uuid.UUID) -> dict:
    with user_session(user_id) as s:
        user = s.get(User, user_id)
        profile = s.get(Profile, user_id)
        mine = lambda model: s.scalars(  # noqa: E731
            select(model).where(model.user_id == user_id).order_by(model.created_at)
        ).all()
        versions: dict[uuid.UUID, list] = {}
        for v in mine(DraftVersion):
            versions.setdefault(v.draft_id, []).append(
                {"text": v.text, "instruction": v.instruction, "created_at": _iso(v.created_at)}
            )
        messages: dict[uuid.UUID, list] = {}
        thread_notes: dict[uuid.UUID, list] = {}  # messages about a whole thread
        for m in mine(DraftMessage):
            line = {"role": m.role, "text": m.text, "created_at": _iso(m.created_at)}
            if m.draft_id is not None:
                messages.setdefault(m.draft_id, []).append(line)
            elif m.thread_id is not None:
                thread_notes.setdefault(m.thread_id, []).append(line)
        reminder = s.get(ReminderSettings, user_id)
        return {
            "exported_at": datetime.now(UTC).isoformat(),
            "account": {
                "email": user.email,
                "timezone": user.timezone,
                "created_at": _iso(user.created_at),
            },
            "reminder": (
                {
                    "enabled": reminder.enabled,
                    "days": reminder.days,
                    "local_time": reminder.local_time.isoformat(timespec="minutes"),
                }
                if reminder
                else None
            ),
            "threads": [
                {
                    "title": t.title,
                    "created_at": _iso(t.created_at),
                    "messages": thread_notes.get(t.id, []),
                }
                for t in mine(Thread)
            ],
            "profile": (
                {
                    **{name: getattr(profile, name) for name in FIELDS},
                    "language": profile.language,
                    "excluded_hashtags": profile.excluded_hashtags,
                    "summary_card": profile.summary_card,
                }
                if profile
                else None
            ),
            "voice_cards": [{"platform": c.platform, "card": c.card} for c in mine(VoiceCard)],
            "platform_settings": [
                {
                    "platform": p.platform,
                    "x_premium": p.x_premium,
                    "audience_places": p.audience_places,
                    "audience_profession": p.audience_profession,
                    "goal": p.goal,
                    "posts_per_week": p.posts_per_week,
                    "channel": p.channel,
                }
                for p in mine(PlatformSettings)
            ],
            "posts": [
                {
                    "platform": p.platform,
                    "text": p.text,
                    "posted_at": _iso(p.posted_at),
                    "likes": p.likes,
                    "reposts": p.reposts,
                    "pinned": p.pinned,
                    "excluded": p.excluded,
                }
                for p in mine(SourcePost)
            ],
            "checkins": [
                {"day": c.day.isoformat(), "text": c.text, "created_at": _iso(c.created_at)}
                for c in mine(Checkin)
            ],
            "drafts": [
                {
                    "platform": d.platform,
                    "topic": d.topic,
                    "status": d.status,
                    "scheduled_for": _iso(d.scheduled_for),
                    "published_at": _iso(d.published_at),
                    "created_at": _iso(d.created_at),
                    "versions": versions.get(d.id, []),
                    "messages": messages.get(d.id, []),
                }
                for d in mine(Draft)
            ],
        }


def delete_all(user_id: uuid.UUID) -> None:
    with user_session(user_id) as s:
        user = s.get(User, user_id)
        if user is not None:
            s.delete(user)  # ON DELETE CASCADE removes every user-owned row
