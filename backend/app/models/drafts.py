import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, CreatedAt


class PlatformProfile(Base):
    """Shared, editable rules per platform (FR-23). Not user-owned, so no RLS."""

    __tablename__ = "platform_profiles"

    platform: Mapped[str] = mapped_column(String(16), primary_key=True)
    char_limit: Mapped[int] = mapped_column(Integer)
    counting_rule: Mapped[str] = mapped_column(String(16))  # "plain" or "x_weighted"
    tone_notes: Mapped[str] = mapped_column(Text)
    structure_notes: Mapped[str] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )


class Draft(CreatedAt, Base):
    """One post in progress (FR-11)."""

    __tablename__ = "drafts"
    __table_args__ = (
        CheckConstraint("platform IN ('telegram', 'x', 'linkedin')", name="platform"),
        CheckConstraint("status IN ('draft', 'approved', 'published', 'discarded')", name="status"),
        Index("ix_drafts_user_created", "user_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, server_default=text("gen_random_uuid()")
    )
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    platform: Mapped[str] = mapped_column(String(16))
    topic: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(16), server_default="draft")
    scheduled_for: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class DraftVersion(CreatedAt, Base):
    """Every revision of a draft; the newest is the current text (FR-10)."""

    __tablename__ = "draft_versions"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, server_default=text("gen_random_uuid()")
    )
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    draft_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("drafts.id", ondelete="CASCADE"), index=True
    )
    text: Mapped[str] = mapped_column(Text)
    instruction: Mapped[str | None] = mapped_column(Text)  # e.g. "shorter"; NULL for the first
    model: Mapped[str | None] = mapped_column(String(64))  # the model version that wrote it


class PromptLog(CreatedAt, Base):
    """The exact prompt behind each version, and who answered it (NFR-15, Q5, Q9)."""

    __tablename__ = "prompt_logs"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, server_default=text("gen_random_uuid()")
    )
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    draft_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("drafts.id", ondelete="CASCADE"), index=True
    )
    draft_version_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("draft_versions.id", ondelete="CASCADE")
    )
    prompt: Mapped[str] = mapped_column(Text)
    model: Mapped[str] = mapped_column(String(64))  # configured name, e.g. gemini-flash-latest
    model_version: Mapped[str | None] = mapped_column(String(64))  # what actually answered
    provider: Mapped[str] = mapped_column(String(32))
