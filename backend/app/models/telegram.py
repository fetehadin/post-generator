"""Telegram bot (FR-36): the account link, the one-time link tokens, the connected channel."""

import uuid
from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, CreatedAt


class TelegramLinkToken(CreatedAt, Base):
    """A one-time "link your account" token. Only its SHA-256 is stored."""

    __tablename__ = "telegram_link_tokens"

    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class TelegramAccount(CreatedAt, Base):
    """This Voxlace user is this Telegram user (one each way)."""

    __tablename__ = "telegram_accounts"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    tg_user_id: Mapped[int] = mapped_column(BigInteger, unique=True)
    tg_username: Mapped[str | None] = mapped_column(String(64))


class TelegramChannel(CreatedAt, Base):
    """The channel the bot was made an admin of. `can_post`: it has the post right."""

    __tablename__ = "telegram_channels"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    chat_id: Mapped[int] = mapped_column(BigInteger, unique=True)
    title: Mapped[str] = mapped_column(String(256))
    username: Mapped[str | None] = mapped_column(String(64))
    can_post: Mapped[bool] = mapped_column(Boolean)
