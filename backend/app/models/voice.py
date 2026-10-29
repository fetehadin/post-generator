import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Identity,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, CreatedAt


class VoiceCard(CreatedAt, Base):
    """How the user writes on one platform, in a few lines they can edit (FR-5, FR-26)."""

    __tablename__ = "voice_cards"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    platform: Mapped[str] = mapped_column(String(16), primary_key=True)
    card: Mapped[str] = mapped_column(Text, default="", server_default="")
    ai_card: Mapped[str] = mapped_column(Text, default="", server_default="")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class PlatformSettings(CreatedAt, Base):
    """The user's own choices for one platform, such as X Premium (Q31)."""

    __tablename__ = "platform_settings"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    platform: Mapped[str] = mapped_column(String(16), primary_key=True)
    x_premium: Mapped[bool | None] = mapped_column(Boolean)
    premium_source: Mapped[str | None] = mapped_column(String(8))  # "user" or "export"
    # Where the audience lives: [{"timezone": "Africa/Addis_Ababa", "share": 70}, …] (FR-33)
    audience_places: Mapped[list[dict]] = mapped_column(JSONB, server_default="[]")
    audience_profession: Mapped[str] = mapped_column(String(16), server_default="general")
    goal: Mapped[str] = mapped_column(Text, server_default="")
    posts_per_week: Mapped[int | None] = mapped_column(SmallInteger)
    channel: Mapped[str | None] = mapped_column(String(64))  # Telegram hand-off (FR-12)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class PostingCurve(Base):
    """How active readers are at each local hour, from studies (FR-16). Shared seed data:
    platform "any" rows reshape every platform for one kind of audience."""

    __tablename__ = "posting_curves"
    __table_args__ = (
        CheckConstraint("cardinality(hours) = 24", name="24_hours"),
        UniqueConstraint(
            "platform",
            "audience",
            "weekday",
            name="uq_posting_curves_key",
            postgresql_nulls_not_distinct=True,
        ),
    )

    id: Mapped[int] = mapped_column(Identity(), primary_key=True)
    platform: Mapped[str] = mapped_column(String(16))
    audience: Mapped[str] = mapped_column(String(16))
    weekday: Mapped[int | None] = mapped_column(SmallInteger)  # 0 = Monday; NULL = every day
    hours: Mapped[list[float]] = mapped_column(ARRAY(Float))
    source: Mapped[str] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
