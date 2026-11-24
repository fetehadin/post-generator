"""What needs the user's attention right now (FR-35, FR-42): posts that are due, posts whose
time passed without "Posted" (or that the Telegram bot couldn't send), and today's check-in
reminder. Telegram drafts for a channel the bot posts to are never due: the bot sends them.

Nothing here is sent anywhere. The app asks every minute and the answer is worked out from
the database at that moment, so there's no job to schedule and nothing to send twice.
"""

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, time, timedelta

from sqlalchemy import select

from app.core.config import get_settings
from app.core.db import user_session
from app.models import Checkin, ReminderSettings, TelegramChannel
from app.services import library
from app.services.clock import local_now

DUE_EARLY = timedelta(minutes=10)  # shown as due a little before its time
MISSED_AFTER = timedelta(minutes=30)  # after that, it's missed: post now or reschedule


@dataclass(frozen=True)
class Notifications:
    due: list[library.DraftRow]
    missed: list[library.DraftRow]
    checkin_reminder: bool


@dataclass(frozen=True)
class Reminder:
    enabled: bool
    days: list[int]  # 0 = Monday … 6 = Sunday
    local_time: time


DEFAULT_REMINDER = Reminder(False, [0, 1, 2, 3, 4], time(18, 0))


def notifications(user_id: uuid.UUID, now: datetime | None = None) -> Notifications:
    now = now or datetime.now(UTC)
    bot = _bot_posts_for(user_id)
    due = [
        r
        for r in library.list_drafts(
            user_id, "approved", scheduled_from=now - MISSED_AFTER, scheduled_to=now + DUE_EARLY
        )
        # The bot posts these by itself (ADR 0001): nothing for the user to hand off.
        if not (bot and r.draft.platform == "telegram") and r.draft.bot_failed_at is None
    ]
    missed = library.list_drafts(user_id, "approved", scheduled_to=now - MISSED_AFTER)
    # A post the bot couldn't send is missed at once, with its reason (bot_error).
    failed = [
        r
        for r in library.list_drafts(user_id, "approved", scheduled_from=now - MISSED_AFTER)
        if r.draft.bot_failed_at is not None
    ]
    seen = {r.draft.id for r in missed}
    missed += [r for r in failed if r.draft.id not in seen]
    return Notifications(due, missed, _checkin_reminder(user_id, now))


def _bot_posts_for(user_id: uuid.UUID) -> bool:
    """The user's Telegram channel is connected and the bot may post there."""
    if not get_settings().telegram_enabled:
        return False
    with user_session(user_id) as s:
        channel = s.get(TelegramChannel, user_id)
        return bool(channel and channel.can_post)


def _checkin_reminder(user_id: uuid.UUID, now: datetime) -> bool:
    """From the reminder time on the chosen days, until there's a check-in for that day."""
    with user_session(user_id) as s:
        settings = s.get(ReminderSettings, user_id)
        if settings is None or not settings.enabled:
            return False
        local = local_now(s, user_id, now)
        if local.weekday() not in settings.days or local.time() < settings.local_time:
            return False
        done = s.scalar(
            select(Checkin.id).where(Checkin.user_id == user_id, Checkin.day == local.date())
        )
        return done is None


def get_reminder(user_id: uuid.UUID) -> Reminder:
    with user_session(user_id) as s:
        r = s.get(ReminderSettings, user_id)
        if r is None:
            return DEFAULT_REMINDER
        return Reminder(r.enabled, sorted(r.days), r.local_time)


def set_reminder(user_id: uuid.UUID, enabled: bool, days: list[int], local_time: time) -> Reminder:
    with user_session(user_id) as s:
        r = s.get(ReminderSettings, user_id)
        if r is None:
            r = ReminderSettings(user_id=user_id)
            s.add(r)
        r.enabled, r.days, r.local_time = enabled, sorted(set(days)), local_time.replace(second=0)
    return get_reminder(user_id)
