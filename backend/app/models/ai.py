"""Users' own AI keys (FR-48) and the log of every AI call (NFR-15, NFR-20)."""

import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    SmallInteger,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, CreatedAt


class UserAIKey(CreatedAt, Base):
    """One key per user per provider, encrypted (app/core/secrets.py). The plain key is never
    stored, logged or sent back; the app shows only its last four characters."""

    __tablename__ = "user_ai_keys"
    __table_args__ = (
        CheckConstraint("provider IN ('google', 'groq')", name="provider"),
        CheckConstraint("status IN ('active', 'rejected')", name="status"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    provider: Mapped[str] = mapped_column(String(16), primary_key=True)
    sealed_key: Mapped[str] = mapped_column(Text)
    last4: Mapped[str] = mapped_column(String(4))
    # "rejected": the provider refused it on a real call; it is skipped until replaced.
    status: Mapped[str] = mapped_column(String(16), server_default="active")
    last_error: Mapped[str | None] = mapped_column(Text)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class AICall(CreatedAt, Base):
    """One logical AI call: what it was for, who answered, on whose key, how long it took and
    how many tokens it used. Never any prompt, post or key text. Guests' calls have no user."""

    __tablename__ = "ai_calls"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    purpose: Mapped[str] = mapped_column(String(32))
    kind: Mapped[str] = mapped_column(String(16))  # generate | embed
    ok: Mapped[bool] = mapped_column(Boolean)
    provider: Mapped[str | None] = mapped_column(String(32))
    model: Mapped[str | None] = mapped_column(String(64))
    model_version: Mapped[str | None] = mapped_column(String(64))
    key_source: Mapped[str | None] = mapped_column(String(8))  # own | default
    error: Mapped[str | None] = mapped_column(String(300))
    attempts: Mapped[int] = mapped_column(SmallInteger)
    routes_tried: Mapped[int] = mapped_column(SmallInteger)
    latency_ms: Mapped[int] = mapped_column(Integer)
    prompt_tokens: Mapped[int | None] = mapped_column(Integer)
    output_tokens: Mapped[int | None] = mapped_column(Integer)
    thinking_tokens: Mapped[int | None] = mapped_column(Integer)
    items: Mapped[int] = mapped_column(Integer, server_default="1")  # texts in an embed call
