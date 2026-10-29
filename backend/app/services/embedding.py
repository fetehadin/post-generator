"""The embedding queue (FR-4, FR-32, FR-44).

Posts with a NULL embedding are the queue. Each run embeds the user's best posts first
(most reactions, then newest), saves after every batch, and stops cleanly when the
embedding model is unavailable, so the next run simply continues. The AI call happens
outside any database transaction, so a slow or retrying call never holds the database.
"""

import logging
import uuid
from dataclasses import dataclass

from sqlalchemy import func, select, text, update
from sqlalchemy.orm import Session

from app.ai.client import AIClient, EmbeddingUnavailable, default_client
from app.core.config import get_settings
from app.core.db import get_engine, user_session
from app.models import Import, SourcePost

logger = logging.getLogger(__name__)

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


def embed_in_background(user_id: uuid.UUID, ai: AIClient | None = None) -> None:
    """Embed everything waiting for this user, best posts first, until done or the model is
    unavailable. A Postgres advisory lock makes it one run per user across every API
    process (NFR-14): a second caller returns at once instead of embedding twice."""
    key = f"embed:{user_id}"
    with get_engine().connect() as conn:
        if not conn.scalar(text("SELECT pg_try_advisory_lock(hashtext(:k))"), {"k": key}):
            conn.commit()
            return
        # The lock belongs to the connection, not the transaction: end the transaction now so
        # the connection isn't left "idle in transaction" for the whole run.
        conn.commit()
        try:
            while True:
                report = embed_pending(user_id, ai=ai)
                if report.stopped_reason or report.remaining == 0 or report.embedded == 0:
                    if report.stopped_reason:
                        logger.info("embedding paused for a user: %s", report.stopped_reason[:80])
                    break
        finally:
            conn.execute(text("SELECT pg_advisory_unlock(hashtext(:k))"), {"k": key})
            conn.commit()


def users_waiting() -> list[uuid.UUID]:
    """Users with posts still waiting for an embedding, across all users. The app role can't
    see other users' rows, so this asks a narrow database function that returns only ids."""
    with get_engine().connect() as conn:
        return list(conn.scalars(text("SELECT users_waiting_for_embeddings()")))
