import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import ARRAY
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
    """Everything the user tells Voxlace about themselves (FR-17, FR-18, FR-24, FR-33, FR-44)."""

    __tablename__ = "profiles"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    role: Mapped[str] = mapped_column(Text, default="", server_default="")
    stack: Mapped[str] = mapped_column(Text, default="", server_default="")
    current_projects: Mapped[str] = mapped_column(Text, default="", server_default="")
    focus: Mapped[str] = mapped_column(Text, default="", server_default="")
    goal: Mapped[str] = mapped_column(Text, default="", server_default="")
    topics: Mapped[str] = mapped_column(Text, default="", server_default="")
    audience: Mapped[str] = mapped_column(Text, default="", server_default="")
    avoid_list: Mapped[str] = mapped_column(Text, default="", server_default="")
    voice_words: Mapped[str] = mapped_column(Text, default="", server_default="")
    links: Mapped[str] = mapped_column(Text, default="", server_default="")
    discipline: Mapped[str] = mapped_column(Text, default="", server_default="")
    usual_hours: Mapped[str] = mapped_column(Text, default="", server_default="")
    language: Mapped[str] = mapped_column(String(32), default="auto", server_default="auto")
    excluded_hashtags: Mapped[list[str] | None] = mapped_column(ARRAY(Text))
    summary_card: Mapped[str] = mapped_column(Text, default="", server_default="")
    summary_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
