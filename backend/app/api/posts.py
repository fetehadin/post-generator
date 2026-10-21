"""The user's imported posts: list (newest first, cursor paging, search) and pin/exclude (FR-25)."""

import base64
import uuid
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, tuple_

from app.core.auth import current_user
from app.core.db import user_session
from app.core.errors import AppError
from app.models import SourcePost
from app.schemas import Platform, PostOut, PostPatchIn, PostsPage

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


def _out(p: SourcePost) -> PostOut:
    return PostOut(
        id=p.id,
        platform=p.platform,
        text=p.text,
        posted_at=p.posted_at,
        likes=p.likes,
        pinned=p.pinned,
        excluded=p.excluded,
        embedded=p.embedding is not None,
    )


@router.get("", response_model=PostsPage)
def list_posts(
    platform: Platform | None = None,
    q: str | None = Query(None, max_length=200, description="Words the post contains"),
    show: Literal["all", "pinned", "excluded"] = "all",
    limit: int = Query(50, ge=1, le=200),
    cursor: str | None = None,
    user_id: uuid.UUID = Depends(current_user),
) -> PostsPage:
    stmt = select(SourcePost).where(SourcePost.user_id == user_id)
    if platform:
        stmt = stmt.where(SourcePost.platform == platform)
    if q and q.strip():
        # Literal match: % and _ in the user's words are not wildcards.
        words = q.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        stmt = stmt.where(SourcePost.text.ilike(f"%{words}%", escape="\\"))
    if show == "pinned":
        stmt = stmt.where(SourcePost.pinned.is_(True))
    elif show == "excluded":
        stmt = stmt.where(SourcePost.excluded.is_(True))
    if cursor:
        when, pid = _decode(cursor)
        stmt = stmt.where(tuple_(SourcePost.posted_at, SourcePost.id) < tuple_(when, pid))
    stmt = stmt.order_by(SourcePost.posted_at.desc(), SourcePost.id.desc()).limit(limit + 1)

    with user_session(user_id) as s:
        rows = s.scalars(stmt).all()
    page = rows[:limit]
    return PostsPage(
        items=[_out(p) for p in page],
        next_cursor=_encode(page[-1].posted_at, page[-1].id) if len(rows) > limit else None,
    )


@router.patch("/{post_id}", response_model=PostOut)
def update_post(
    post_id: uuid.UUID, body: PostPatchIn, user_id: uuid.UUID = Depends(current_user)
) -> PostOut:
    with user_session(user_id) as s:
        post = s.get(SourcePost, post_id)  # RLS: another user's post is simply not found
        if post is None:
            raise AppError("not_found", "Not found.", 404)
        if body.pinned is not None:
            post.pinned = body.pinned
            if body.pinned:
                post.excluded = False
        if body.excluded is not None:
            post.excluded = body.excluded
            if body.excluded:
                post.pinned = False
        s.flush()
        return _out(post)
