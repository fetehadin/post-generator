"""The user's own clock (NFR-16). The database and API stay in UTC; these helpers answer
"what day and time is it for this user?" from the time zone saved on their account."""

import uuid
from datetime import UTC, date, datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError, available_timezones

from sqlalchemy.orm import Session

from app.models import User


def valid_zone(name: str) -> bool:
    """An IANA time zone name such as "Africa/Addis_Ababa"."""
    return name in available_timezones()


def zone(name: str | None) -> ZoneInfo:
    try:
        return ZoneInfo(name or "UTC")
    except (ZoneInfoNotFoundError, ValueError):
        return ZoneInfo("UTC")


def user_zone(s: Session, user_id: uuid.UUID) -> ZoneInfo:
    user = s.get(User, user_id)
    return zone(user.timezone if user else None)


def local_now(s: Session, user_id: uuid.UUID, now: datetime | None = None) -> datetime:
    return (now or datetime.now(UTC)).astimezone(user_zone(s, user_id))


def local_today(s: Session, user_id: uuid.UUID, now: datetime | None = None) -> date:
    return local_now(s, user_id, now).date()
