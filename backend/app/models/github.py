"""GitHub → daily dev drafts (FR-14): the connection, repos, collected activity, digests.

Never any code: commit messages, PR titles and descriptions, counts and languages only, with
anything that looks like a secret removed before it is stored (services/github_scrub.py).
"""

import uuid
from datetime import date, datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, CreatedAt


class GitHubConnection(CreatedAt, Base):
    """One per user. The OAuth token (no scopes: public data, our own rate limit) is sealed
    like users' AI keys. `installation_id`: the GitHub App for private repos, if installed."""

    __tablename__ = "github_connections"
    __table_args__ = (
        CheckConstraint("frequency IN ('daily', 'weekly', 'highlights')", name="frequency"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    github_user_id: Mapped[int] = mapped_column(BigInteger)
    login: Mapped[str] = mapped_column(String(64))
    sealed_token: Mapped[str] = mapped_column(Text)
    installation_id: Mapped[int | None] = mapped_column(BigInteger, unique=True)
    frequency: Mapped[str] = mapped_column(String(16), server_default="daily")
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class GitHubRepo(CreatedAt, Base):
    """A repo we've seen activity in. `mention_ok`: may drafts name it and its details?
    Default yes for public repos, no for private ones (the user turns it on)."""

    __tablename__ = "github_repos"
    __table_args__ = (UniqueConstraint("user_id", "repo_id"),)

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, server_default=text("gen_random_uuid()")
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    repo_id: Mapped[int] = mapped_column(BigInteger)
    full_name: Mapped[str] = mapped_column(String(200))
    private: Mapped[bool] = mapped_column(Boolean)
    mention_ok: Mapped[bool] = mapped_column(Boolean)
    languages: Mapped[list[str]] = mapped_column(ARRAY(String(40)), server_default="{}")
    repo_created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class GitHubItem(CreatedAt, Base):
    """One commit, pull request or release by the user. Text is scrubbed before saving."""

    __tablename__ = "github_items"
    __table_args__ = (
        UniqueConstraint("user_id", "repo_id", "kind", "external_id"),
        CheckConstraint("kind IN ('commit', 'pr', 'release')", name="kind"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, server_default=text("gen_random_uuid()")
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    repo_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("github_repos.id", ondelete="CASCADE"))
    kind: Mapped[str] = mapped_column(String(16))
    external_id: Mapped[str] = mapped_column(String(80))  # sha, PR number, tag
    title: Mapped[str] = mapped_column(Text)  # first line of the message, PR title, tag name
    body: Mapped[str] = mapped_column(Text, server_default="")  # rest of message, PR text
    state: Mapped[str | None] = mapped_column(String(16))  # opened | merged | closed
    happened_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    files_changed: Mapped[int | None] = mapped_column(Integer)
    additions: Mapped[int | None] = mapped_column(Integer)
    deletions: Mapped[int | None] = mapped_column(Integer)
    deps_only: Mapped[bool] = mapped_column(Boolean, server_default="false")  # lockfiles only


class GitHubDigest(CreatedAt, Base):
    """One decision per user per day (or week): worth posting or not, and why."""

    __tablename__ = "github_digests"
    __table_args__ = (
        UniqueConstraint("user_id", "day", "kind"),
        CheckConstraint("kind IN ('daily', 'weekly')", name="kind"),
        CheckConstraint(
            "status IN ('nothing', 'suggested', 'skipped')", name="status"
        ),  # skipped: worth it, but no draft could be written (no platform ready)
    )

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, server_default=text("gen_random_uuid()")
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    day: Mapped[date] = mapped_column(Date)  # the user's local day
    kind: Mapped[str] = mapped_column(String(16))
    score: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(16))
    reason: Mapped[str] = mapped_column(Text)
    angle: Mapped[str | None] = mapped_column(Text)
    item_ids: Mapped[list[uuid.UUID]] = mapped_column(ARRAY(Uuid), server_default="{}")
    thread_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("threads.id", ondelete="SET NULL")
    )
    discarded: Mapped[int] = mapped_column(Integer, server_default="0")  # drafts thrown away
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
