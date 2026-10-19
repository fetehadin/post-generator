"""Finding the user's past posts closest to a topic (FR-7, FR-25, Q24).

These become the voice examples in the prompt. Pinned posts are always included,
excluded ones never; only this user's posts on this platform count; only vectors from
the current embedding model are compared (vectors from different models are
meaningless together, C-7); and near-copies are dropped so the examples vary.
"""

import math
import uuid
from collections.abc import Sequence
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai.client import AIClient, default_client
from app.core.config import get_settings
from app.core.db import user_session
from app.models import SourcePost

EXAMPLES = 8
CANDIDATES = 40  # closest posts considered before dropping near-copies
NEAR_COPY = 0.95  # cosine similarity above which two posts count as the same example


@dataclass(frozen=True)
class Example:
    id: uuid.UUID
    text: str
    similarity: float
    pinned: bool


def cosine(a: Sequence[float], b: Sequence[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b, strict=True))
    norm = math.sqrt(sum(x * x for x in a)) * math.sqrt(sum(y * y for y in b))
    return dot / norm if norm else 0.0


def nearest_posts(
    session: Session,
    user_id: uuid.UUID,
    platform: str,
    query_vector: Sequence[float],
    k: int = EXAMPLES,
    near_copy: float = NEAR_COPY,
) -> list[Example]:
    model = get_settings().embedding_model
    distance = SourcePost.embedding.cosine_distance(list(query_vector))
    usable = (
        SourcePost.user_id == user_id,  # RLS enforces this too; the filter keeps intent clear
        SourcePost.platform == platform,
        SourcePost.excluded.is_(False),
        SourcePost.embedding.is_not(None),
        SourcePost.embedding_model == model,
    )
    cols = (SourcePost.id, SourcePost.text, SourcePost.embedding, distance.label("distance"))

    pinned = session.execute(
        select(*cols).where(*usable, SourcePost.pinned.is_(True)).order_by(distance).limit(k)
    ).all()
    candidates = session.execute(
        select(*cols)
        .where(*usable, SourcePost.pinned.is_(False))
        .order_by(distance)
        .limit(max(CANDIDATES, k))
    ).all()

    chosen: list[Example] = []
    vectors: list[Sequence[float]] = []
    for row, is_pinned in [(r, True) for r in pinned] + [(r, False) for r in candidates]:
        if len(chosen) == k:
            break
        if not is_pinned and any(cosine(row.embedding, v) > near_copy for v in vectors):
            continue
        chosen.append(Example(row.id, row.text, 1.0 - float(row.distance), is_pinned))
        vectors.append(row.embedding)
    return chosen


def find_examples(
    user_id: uuid.UUID,
    platform: str,
    topic: str,
    ai: AIClient | None = None,
    k: int = EXAMPLES,
) -> list[Example]:
    """Embed the topic (outside any transaction), then search as this user."""
    query_vector = (ai or default_client()).embed_query(topic)
    with user_session(user_id) as s:
        return nearest_posts(s, user_id, platform, query_vector, k=k)
