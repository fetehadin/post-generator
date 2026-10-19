"""Listing the user's imported posts, newest first, with cursor paging."""

import base64
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, tuple_

from app.core.auth import current_user
from app.core.db import user_session
from app.core.errors import AppError
from app.models import SourcePost
from app.schemas import Platform, PostOut, PostsPage

router = APIRouter(prefix="/posts", tags=["posts"])


def _encode(posted_at: datetime, post_id: uuid.UUID) -> str:
    return base64.urlsafe_b64encode(f"{posted_at.isoformat()}|{post_id}".encode()).decode()


def _decode(cursor: str) -> tuple[datetime, uuid.UUID]:
    try:
        when, _, pid = base64.urlsafe_b64decode(cursor.encode()).decode().partition("|")
        return datetime.fromisoformat(when), uuid.UUID(pid)
    except (ValueError, UnicodeDecodeError) as e:
        raise AppError(
            "invalid_cursor", "That page link is invalid. Start from the first page."
        ) from e


@router.get("", response_model=PostsPage)
def list_posts(
    platform: Platform | None = None,
    limit: int = Query(50, ge=1, le=200),
    cursor: str | None = None,
    user_id: uuid.UUID = Depends(current_user),
) -> PostsPage:
    stmt = select(SourcePost).where(SourcePost.user_id == user_id)
    if platform:
        stmt = stmt.where(SourcePost.platform == platform)
    if cursor:
        when, pid = _decode(cursor)
        stmt = stmt.where(tuple_(SourcePost.posted_at, SourcePost.id) < tuple_(when, pid))
    stmt = stmt.order_by(SourcePost.posted_at.desc(), SourcePost.id.desc()).limit(limit + 1)

    with user_session(user_id) as s:
        rows = s.scalars(stmt).all()
    page = rows[:limit]
    return PostsPage(
        items=[
            PostOut(
                id=p.id,
                platform=p.platform,
                text=p.text,
                posted_at=p.posted_at,
                likes=p.likes,
                pinned=p.pinned,
                excluded=p.excluded,
                embedded=p.embedding is not None,
            )
            for p in page
        ],
        next_cursor=_encode(page[-1].posted_at, page[-1].id) if len(rows) > limit else None,
    )
