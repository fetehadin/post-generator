import uuid
from datetime import datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, CreatedAt

EMBEDDING_DIMENSIONS = 768


class Import(CreatedAt, Base):
    """One upload. Its progress is what GET /imports/{id} shows (OPEN_QUESTIONS Q2)."""

    __tablename__ = "imports"
    __table_args__ = (
        CheckConstraint("platform IN ('telegram', 'x', 'linkedin')", name="platform"),
        CheckConstraint("status IN ('parsing', 'embedding', 'done', 'failed')", name="status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, server_default=text("gen_random_uuid()")
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    platform: Mapped[str] = mapped_column(String(16))
    status: Mapped[str] = mapped_column(String(16), server_default="parsing")
    parsed: Mapped[int] = mapped_column(Integer, server_default="0")
    skipped: Mapped[dict] = mapped_column(JSONB, server_default=text("'{}'::jsonb"))
    embedded: Mapped[int] = mapped_column(Integer, server_default="0")
    error: Mapped[str | None] = mapped_column(Text)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class SourcePost(CreatedAt, Base):
    """A post the user wrote: imported, or published through Voxlace (origin)."""

    __tablename__ = "source_posts"
    __table_args__ = (
        UniqueConstraint("user_id", "platform", "external_id", name="uq_source_posts_external"),
        CheckConstraint("platform IN ('telegram', 'x', 'linkedin')", name="platform"),
        CheckConstraint("origin IN ('import', 'voxlace')", name="origin"),
        # A vector always says which model made it, so vectors are never mixed (C-7, Q3).
        CheckConstraint(
            "(embedding IS NULL) = (embedding_model IS NULL)", name="embedding_has_model"
        ),
        Index("ix_source_posts_user_platform", "user_id", "platform"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, server_default=text("gen_random_uuid()")
    )
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    import_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("imports.id", ondelete="SET NULL")
    )
    platform: Mapped[str] = mapped_column(String(16))
    origin: Mapped[str] = mapped_column(String(16), server_default="import")
    external_id: Mapped[str] = mapped_column(String(64))
    text: Mapped[str] = mapped_column(Text)
    posted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    likes: Mapped[int] = mapped_column(Integer, server_default="0")
    reposts: Mapped[int] = mapped_column(Integer, server_default="0")
    pinned: Mapped[bool] = mapped_column(Boolean, server_default="false")
    excluded: Mapped[bool] = mapped_column(Boolean, server_default="false")
    # NULL until embedded: the NULL rows are the embedding queue (FR-32, Q6).
    embedding: Mapped[list[float] | None] = mapped_column(Vector(EMBEDDING_DIMENSIONS))
    embedding_model: Mapped[str | None] = mapped_column(String(64))
