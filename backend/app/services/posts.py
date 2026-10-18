"""Saving imported posts. Runs inside app.core.db.user_session, so RLS applies."""

import uuid
from collections.abc import Sequence
from dataclasses import dataclass

from sqlalchemy import case, literal_column, tuple_
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.importers.common import ParsedPost
from app.models import SourcePost

# 9 values per row; Postgres allows 65,535 bound values per statement.
CHUNK = 1000


@dataclass(frozen=True)
class SaveResult:
    new: int
    updated: int


def save_posts(
    session: Session,
    user_id: uuid.UUID,
    platform: str,
    posts: Sequence[ParsedPost],
    import_id: uuid.UUID | None = None,
) -> SaveResult:
    """Insert new posts and refresh changed ones; never duplicate (FR-2).

    The unique key is (user_id, platform, external_id). On a re-import, an unchanged
    post is left alone; a post whose text changed (edited, or tidied by a newer parser)
    gets the new text and goes back into the embedding queue; reactions are refreshed.
    """
    new = updated = 0
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
        stmt = insert(SourcePost).values(rows)
        text_changed = SourcePost.text.is_distinct_from(stmt.excluded.text)
        stmt = stmt.on_conflict_do_update(
            constraint="uq_source_posts_external",
            set_={
                "text": stmt.excluded.text,
                "likes": stmt.excluded.likes,
                "embedding": case((text_changed, None), else_=SourcePost.embedding),
                "embedding_model": case((text_changed, None), else_=SourcePost.embedding_model),
            },
            where=tuple_(SourcePost.text, SourcePost.likes).is_distinct_from(
                tuple_(stmt.excluded.text, stmt.excluded.likes)
            ),
        ).returning(literal_column("xmax = 0").label("inserted"))  # xmax 0 = a new row
        for row in session.execute(stmt):
            if row.inserted:
                new += 1
            else:
                updated += 1
    return SaveResult(new=new, updated=updated)
