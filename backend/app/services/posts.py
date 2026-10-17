"""Saving imported posts. Runs inside app.core.db.user_session, so RLS applies."""

import uuid
from collections.abc import Sequence

from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.importers.common import ParsedPost
from app.models import SourcePost

# 9 values per row; Postgres allows 65,535 bound values per statement.
CHUNK = 1000


def save_posts(
    session: Session,
    user_id: uuid.UUID,
    platform: str,
    posts: Sequence[ParsedPost],
    import_id: uuid.UUID | None = None,
) -> int:
    """Insert posts the user doesn't have yet; return how many were new.

    Re-importing the same export inserts nothing (FR-2): the unique key is
    (user_id, platform, external_id) and conflicts are skipped, not errors.
    """
    inserted = 0
    for start in range(0, len(posts), CHUNK):
        rows = [
            {
                "user_id": user_id,
                "import_id": import_id,
                "platform": platform,
                "origin": "import",
                "external_id": p.external_id,
                "text": p.text,
                "posted_at": p.posted_at,
                "likes": p.reactions,
            }
            for p in posts[start : start + CHUNK]
        ]
        stmt = (
            insert(SourcePost)
            .values(rows)
            .on_conflict_do_nothing(constraint="uq_source_posts_external")
            .returning(SourcePost.id)
        )
        inserted += len(session.execute(stmt).all())
    return inserted
