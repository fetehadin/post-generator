"""Daily limits per user (FR-30): fair use of the free AI tier, and one user can't use up
everyone's quota. Days are UTC days; the app shows when the count resets in local time."""

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, time, timedelta

from sqlalchemy import func, select

from app.core.config import get_settings
from app.core.db import user_session
from app.models import PromptLog, SourcePost


@dataclass(frozen=True)
class Usage:
    drafts: int
    draft_limit: int
    posts: int
    post_limit: int
    resets_at: datetime


class LimitReached(Exception):
    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


def _today() -> tuple[datetime, datetime]:
    start = datetime.combine(datetime.now(UTC).date(), time(), tzinfo=UTC)
    return start, start + timedelta(days=1)


def usage(user_id: uuid.UUID) -> Usage:
    start, end = _today()
    with user_session(user_id) as s:
        drafts = s.scalar(
            select(func.count())
            .select_from(PromptLog)
            .where(PromptLog.user_id == user_id, PromptLog.created_at >= start)
        )
        posts = s.scalar(
            select(func.count())
            .select_from(SourcePost)
            .where(SourcePost.user_id == user_id, SourcePost.created_at >= start)
        )
    cfg = get_settings()
    return Usage(drafts, cfg.daily_draft_limit, posts, cfg.daily_post_limit, end)


def check_drafts(user_id: uuid.UUID) -> None:
    u = usage(user_id)
    if u.drafts >= u.draft_limit:
        raise LimitReached(
            f"You've used today's {u.draft_limit} drafts and revisions. "
            "Your text is kept; the count resets at midnight UTC."
        )
