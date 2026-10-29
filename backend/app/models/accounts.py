import uuid
from datetime import datetime, time

from sqlalchemy import Boolean, DateTime, ForeignKey, SmallInteger, String, Text, Time, func
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
    # The hours they can post on their own clock; every hand-off needs them awake (FR-45).
    post_window_start: Mapped[time] = mapped_column(Time, server_default="08:00")
    post_window_end: Mapped[time] = mapped_column(Time, server_default="22:00")
    summary_card: Mapped[str] = mapped_column(Text, default="", server_default="")
    summary_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class ReminderSettings(CreatedAt, Base):
    """Daily check-in reminder, shown in the app (FR-42). days: 0 = Monday … 6 = Sunday,
    local_time in the user's own time zone."""

    __tablename__ = "reminder_settings"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    enabled: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    days: Mapped[list[int]] = mapped_column(ARRAY(SmallInteger), server_default="{0,1,2,3,4}")
    local_time: Mapped[time] = mapped_column(Time, server_default="18:00")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
