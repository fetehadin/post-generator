import uuid
from datetime import datetime

from sqlalchemy import DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, CreatedAt


class User(CreatedAt, Base):
    __tablename__ = "users"

    # The id comes from the login provider (Supabase) from Phase 2; a fixed dev user until then.
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(320), unique=True)
    name: Mapped[str | None] = mapped_column(String(200))
    timezone: Mapped[str] = mapped_column(String(64), default="UTC", server_default="UTC")
    language: Mapped[str] = mapped_column(String(32), default="en", server_default="en")
    privacy_accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
