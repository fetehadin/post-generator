"""Daily check-ins: what the user did, on their own calendar day (FR-6)."""

import uuid
from datetime import date

from sqlalchemy import select

from app.core.db import user_session
from app.models import Checkin
from app.services.clock import local_today


def _detached(s, row: Checkin) -> Checkin:
    s.flush()
    s.refresh(row)
    s.expunge(row)
    return row


def create(user_id: uuid.UUID, text: str, day: date | None = None) -> Checkin:
    """`day` defaults to today on the user's own clock (NFR-16)."""
    with user_session(user_id) as s:
        row = Checkin(user_id=user_id, day=day or local_today(s, user_id), text=text)
        s.add(row)
        return _detached(s, row)


def list_recent(user_id: uuid.UUID, limit: int = 60) -> list[Checkin]:
    with user_session(user_id) as s:
        rows = s.scalars(
            select(Checkin)
            .where(Checkin.user_id == user_id)
            .order_by(Checkin.day.desc(), Checkin.created_at.desc())
            .limit(limit)
        ).all()
        s.expunge_all()
        return list(rows)


def update(user_id: uuid.UUID, checkin_id: uuid.UUID, changes: dict) -> Checkin | None:
    with user_session(user_id) as s:
        row = s.get(Checkin, checkin_id)
        if row is None or row.user_id != user_id:
            return None
        for name, value in changes.items():
            setattr(row, name, value)
        return _detached(s, row)


def delete(user_id: uuid.UUID, checkin_id: uuid.UUID) -> bool:
    with user_session(user_id) as s:
        row = s.get(Checkin, checkin_id)
        if row is None or row.user_id != user_id:
            return False
        s.delete(row)
        return True
