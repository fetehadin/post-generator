import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, func
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
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
