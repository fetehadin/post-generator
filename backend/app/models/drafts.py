import uuid
from datetime import date, datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    String,
    Text,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, CreatedAt

# The local model's vectors (app/ai/local_embed.py). Changing it needs a migration.
LOCAL_DIMENSIONS = 384


class ExemplarPost(Base):
    """The shared inspiration pool per platform (FR-41): team-written templates (0010) and
    posts by creators, imported for their STRUCTURE only (0014). Never shown to users and
    never a source of facts or wording; drafts borrow the hook, shape, rhythm and length.
    Not user-owned, so no RLS. Vectors come from the local model (rule 3), not Gemini."""

    __tablename__ = "exemplar_posts"
    __table_args__ = (
        CheckConstraint("platform IN ('telegram', 'x', 'linkedin')", name="platform"),
        CheckConstraint("source IN ('template', 'creator')", name="source"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, server_default=text("gen_random_uuid()")
    )
    platform: Mapped[str] = mapped_column(String(16), index=True)
    post_type: Mapped[str] = mapped_column(String(32))
    position: Mapped[int] = mapped_column(SmallInteger)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )
    source: Mapped[str] = mapped_column(String(16), server_default="template")
    author: Mapped[str | None] = mapped_column(String(64))  # the creator's handle
    text_hash: Mapped[str | None] = mapped_column(String(64))  # sha256: import twice, store once
    # Tags from the free LLM (`python -m app.dev backfill-inspiration`), NULL until tagged.
    hook_type: Mapped[str | None] = mapped_column(String(32))
    structure: Mapped[str | None] = mapped_column(Text)  # the shape in topic-free words
    tone: Mapped[str | None] = mapped_column(String(32))
    goal: Mapped[str | None] = mapped_column(String(16))
    source_profession: Mapped[str | None] = mapped_column(String(48))
    tagged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    embedding: Mapped[list[float] | None] = mapped_column(Vector(LOCAL_DIMENSIONS))
    structure_embedding: Mapped[list[float] | None] = mapped_column(Vector(LOCAL_DIMENSIONS))
    embedding_model: Mapped[str | None] = mapped_column(String(128))
    # Declared last: inside the class body, `text` would otherwise hide sqlalchemy's text().
    text: Mapped[str] = mapped_column(Text)


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
        Index("ix_drafts_user_scheduled", "user_id", "scheduled_for"),
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
    # The Telegram bot couldn't post it at its time (ADR 0001): not retried, shown as missed.
    bot_failed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    bot_error: Mapped[str | None] = mapped_column(String(300))
    checkin_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("checkins.id", ondelete="SET NULL")
    )
    thread_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("threads.id", ondelete="SET NULL"), index=True
    )
    # Written from another draft: "make a LinkedIn version" (FR-40).
    source_draft_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("drafts.id", ondelete="SET NULL")
    )
    # Saved from a guest receipt (FR-47): its id, unique across all accounts, so a receipt is
    # saved once. A retried save finds the draft instead of making a second copy.
    guest_receipt_id: Mapped[str | None] = mapped_column(String(32), unique=True)


class Thread(CreatedAt, Base):
    """One conversation on the chat board: a check-in, its drafts, every revision (FR-46)."""

    __tablename__ = "threads"
    __table_args__ = (Index("ix_threads_user_updated", "user_id", "updated_at"),)

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, server_default=text("gen_random_uuid()")
    )
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(Text, server_default="")
    checkin_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("checkins.id", ondelete="SET NULL")
    )
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


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
    # "own": written on the user's own AI key (FR-48), so it isn't counted against the daily
    # limit; "default": the app's key.
    key_source: Mapped[str] = mapped_column(String(8), server_default="default")


class DraftMessage(CreatedAt, Base):
    """One line of a thread: the user's words or the assistant's answer (FR-40, FR-46). A
    message with a draft_version_id is a draft card; one without a draft_id is about the
    whole thread, such as the check-in."""

    __tablename__ = "draft_messages"
    __table_args__ = (CheckConstraint("role IN ('user', 'assistant')", name="role"),)

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, server_default=text("gen_random_uuid()")
    )
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    thread_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("threads.id", ondelete="CASCADE"), index=True
    )
    draft_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("drafts.id", ondelete="CASCADE"), index=True
    )
    role: Mapped[str] = mapped_column(String(16))
    text: Mapped[str] = mapped_column(Text)
    draft_version_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("draft_versions.id", ondelete="SET NULL")
    )


class Checkin(CreatedAt, Base):
    """What the user did on one of their days (FR-6)."""

    __tablename__ = "checkins"
    __table_args__ = (Index("ix_checkins_user_day", "user_id", "day"),)

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, server_default=text("gen_random_uuid()")
    )
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    day: Mapped[date] = mapped_column(Date)
    text: Mapped[str] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
