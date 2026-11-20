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

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.ai.client import AIClient, default_client, for_user
from app.core.config import get_settings
from app.core.db import user_session
from app.models import ExemplarPost, SourcePost
from app.services.voice import THIN  # FR-5: one threshold for the warning and the pool

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


def _usable(user_id: uuid.UUID, platform: str) -> tuple:
    """Posts that can be examples: this user's, this platform, not excluded, embedded with
    the current model. One definition for searching and for counting."""
    return (
        SourcePost.user_id == user_id,  # RLS enforces this too; the filter keeps intent clear
        SourcePost.platform == platform,
        SourcePost.excluded.is_(False),
        SourcePost.embedding.is_not(None),
        SourcePost.embedding_model == get_settings().embedding_model,
    )


def nearest_posts(
    session: Session,
    user_id: uuid.UUID,
    platform: str,
    query_vector: Sequence[float],
    k: int = EXAMPLES,
    near_copy: float = NEAR_COPY,
) -> list[Example]:
    distance = SourcePost.embedding.cosine_distance(list(query_vector))
    usable = _usable(user_id, platform)
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


@dataclass(frozen=True)
class PostCounts:
    usable: int  # ready to be examples
    waiting: int  # imported, not excluded, not embedded yet

    @property
    def thin(self) -> bool:
        return self.usable < THIN


def post_counts(user_id: uuid.UUID, platform: str) -> PostCounts:
    with user_session(user_id) as s:
        usable = s.scalar(select(func.count()).where(*_usable(user_id, platform)))
        waiting = s.scalar(
            select(func.count()).where(
                SourcePost.user_id == user_id,
                SourcePost.platform == platform,
                SourcePost.excluded.is_(False),
                SourcePost.embedding.is_(None),
            )
        )
    return PostCounts(usable, waiting)


def inspiration(user_id: uuid.UUID, platform: str) -> list[str]:
    """The team's templates for a platform, in their set order (migration 0010): the fallback
    when no structure examples can be found (no local model, an empty pool)."""
    with user_session(user_id) as s:
        return list(
            s.scalars(
                select(ExemplarPost.text)
                .where(ExemplarPost.platform == platform, ExemplarPost.source == "template")
                .order_by(ExemplarPost.position)
            )
        )


# FR-41: words that mean "a developer". Anyone else gets examples matched by structure, so a
# nurse's draft borrows a dev post's shape, not its jargon.
DEV_WORDS = (
    "develop", "engineer", "programm", "coder", "software", "devops", "sre", "data scien",
    "machine learning", "ml ", "ai ", "frontend", "front-end", "backend", "back-end",
    "full stack", "fullstack", "full-stack", "web dev", "mobile dev", "tech lead", "cto",
)  # fmt: skip


CANDIDATES = 12  # nearest posts considered before picking the k examples
MIN_SHAPE_CHARS = 80


def is_developer(profession: str) -> bool:
    p = f" {profession.lower()} "
    return any(w in p for w in DEV_WORDS)


@dataclass(frozen=True)
class StructureExample:
    id: uuid.UUID
    text: str
    hook_type: str | None
    structure: str | None
    embedding: list[float]


def structure_examples(
    platform: str,
    idea: str,
    profession: str,
    goal: str = "",
    hook_type: str | None = None,
    k: int | None = None,
    embedder=None,
) -> list[StructureExample]:
    """FR-41: the k best inspiration posts on this platform for this idea. Developers: closest
    by topic (the post itself). Everyone else: closest by shape (its topic-free structure line),
    asked as "a <goal> post: <idea>", so the topic of dev posts can't pull them in."""
    from app.ai.local_embed import local_embedder

    embedder = embedder or local_embedder()
    k = k or get_settings().structure_examples
    dev = is_developer(profession)
    query = idea if dev else f"a {goal or 'useful'} post: {idea}"
    vector = embedder.embed_query(query[:2000])
    column = ExemplarPost.embedding if dev else ExemplarPost.structure_embedding
    filters = [
        ExemplarPost.platform == platform,
        ExemplarPost.embedding_model == embedder.model_name,  # never compare across models
        column.is_not(None),
        # A post worth learning from: tagged with a real hook, and long enough to have a shape.
        ExemplarPost.hook_type.is_not(None),
        ExemplarPost.hook_type != "other",
        func.length(ExemplarPost.text) >= MIN_SHAPE_CHARS,
    ]
    if hook_type:
        filters.append(ExemplarPost.hook_type == hook_type)
    distance = column.cosine_distance(vector).label("distance")
    with user_session(uuid.UUID(int=0)) as s:
        # pgvector 0.8: keep scanning the HNSW index until enough rows pass the filters.
        s.execute(text("SET LOCAL hnsw.iterative_scan = relaxed_order"))
        rows = s.execute(
            select(
                ExemplarPost.id,
                ExemplarPost.text,
                ExemplarPost.hook_type,
                ExemplarPost.structure,
                ExemplarPost.embedding,
                ExemplarPost.goal,
                ExemplarPost.author,
                ExemplarPost.source,
                distance,
            )
            .where(*filters)
            .order_by(distance)
            .limit(CANDIDATES)
        ).all()
    # Of the closest few: creators' real posts before templates, the user's goal first, then
    # the closest; at most one post per author, so three examples show three styles.
    rows = sorted(rows, key=lambda r: (r.source == "template", bool(goal) and r.goal != goal,
                                       r.distance))  # fmt: skip
    picked, authors = [], set()
    for r in rows:
        if r.author and r.author in authors:
            continue
        authors.add(r.author)
        picked.append(r)
        if len(picked) == k:
            break
    rows = picked
    return [
        StructureExample(r.id, r.text, r.hook_type, r.structure, [float(x) for x in r.embedding])
        for r in rows
    ]


def find_examples(
    user_id: uuid.UUID,
    platform: str,
    topic: str,
    ai: AIClient | None = None,
    k: int = EXAMPLES,
) -> list[Example]:
    """Embed the topic (outside any transaction), then search as this user."""
    query_vector = for_user(ai or default_client(), user_id).embed_query(topic)
    with user_session(user_id) as s:
        return nearest_posts(s, user_id, platform, query_vector, k=k)
