"""The embedding queue (FR-4, FR-32, FR-44).

Posts with a NULL embedding are the queue. Each run embeds the user's best posts first
(most reactions, then newest), saves after every batch, and stops cleanly when the
embedding model is unavailable, so the next run simply continues. The AI call happens
outside any database transaction, so a slow or retrying call never holds the database.
"""

import uuid
from dataclasses import dataclass

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.ai.client import AIClient, EmbeddingUnavailable, default_client
from app.core.config import get_settings
from app.core.db import user_session
from app.models import Import, SourcePost

DEFAULT_LIMIT = 1000  # "best ~1,000 first" per run (FR-44)
BATCH = 100


@dataclass(frozen=True)
class EmbedReport:
    embedded: int
    remaining: int
    stopped_reason: str | None = None


def _pending(user_id: uuid.UUID):
    return (
        SourcePost.user_id == user_id,
        SourcePost.embedding.is_(None),
        SourcePost.excluded.is_(False),
    )


def embed_pending(
    user_id: uuid.UUID,
    ai: AIClient | None = None,
    limit: int = DEFAULT_LIMIT,
    batch_size: int = BATCH,
) -> EmbedReport:
    ai = ai or default_client()
    model = get_settings().embedding_model
    done, reason = 0, None

    while done < limit:
        with user_session(user_id) as s:
            rows = s.execute(
                select(SourcePost.id, SourcePost.text)
                .where(*_pending(user_id))
                .order_by(SourcePost.likes.desc(), SourcePost.posted_at.desc())
                .limit(min(batch_size, limit - done))
            ).all()
        if not rows:
            break
        try:
            vectors = ai.embed_documents([r.text for r in rows])
        except EmbeddingUnavailable as e:
            reason = str(e)
            break
        with user_session(user_id) as s:
            s.execute(
                update(SourcePost),
                [
                    {"id": r.id, "embedding": v, "embedding_model": model}
                    for r, v in zip(rows, vectors, strict=True)
                ],
            )
        done += len(rows)

    with user_session(user_id) as s:
        remaining = s.scalar(select(func.count()).where(*_pending(user_id)))
        _refresh_imports(s, user_id)
    return EmbedReport(embedded=done, remaining=remaining, stopped_reason=reason)


def _refresh_imports(s: Session, user_id: uuid.UUID) -> None:
    """Keep each import's progress (what GET /imports/{id} will show) in step."""
    imports = s.scalars(
        select(Import).where(Import.user_id == user_id, Import.status == "embedding")
    ).all()
    for imp in imports:
        mine = SourcePost.import_id == imp.id
        imp.embedded = s.scalar(select(func.count()).where(mine, SourcePost.embedding.is_not(None)))
        waiting = s.scalar(
            select(func.count()).where(
                mine, SourcePost.embedding.is_(None), SourcePost.excluded.is_(False)
            )
        )
        if waiting == 0:
            imp.status = "done"
            imp.finished_at = func.now()
