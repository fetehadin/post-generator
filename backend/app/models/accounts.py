import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, CreatedAt


class Invite(CreatedAt, Base):
    """FR-28: an invite code, optionally for one email. No user_id and no RLS (SRS §7)."""

    __tablename__ = "invites"

    code: Mapped[str] = mapped_column(String(64), primary_key=True)
    email: Mapped[str | None] = mapped_column(String(320))
    used_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Profile(CreatedAt, Base):
    """The About-you form arrives in Phase 3; Phase 2 creates the row."""

    __tablename__ = "profiles"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
