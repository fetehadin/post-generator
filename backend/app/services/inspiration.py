"""The shared inspiration pool (FR-41): creators' posts used for their STRUCTURE only.

Three steps, each safe to run again:
1. `add_posts`: store posts (deduplicated by a hash of the text). Never shown to users.
2. `tag_pending`: the free LLM labels each post's shape (hook type, structure, tone, goal, the
   author's field). Small batches; on rate limits the AI client backs off, and when every model
   is busy we stop and the next run carries on where this one stopped.
3. `embed_pending`: the local model embeds each post and its topic-free structure line. Rows
   already embedded with the current model are skipped; a new model re-embeds everything.
"""

import hashlib
import json
import logging
import re
import time
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from string import Template

from sqlalchemy import func, or_, select, update
from sqlalchemy.dialects.postgresql import insert

from app.ai.client import AIClient, AIUnavailable, default_client
from app.ai.local_embed import LocalEmbedder, local_embedder
from app.core.db import user_session
from app.models import ExemplarPost

logger = logging.getLogger(__name__)

NOBODY = uuid.UUID(int=0)  # the pool is no one's; no user is set
TAG_PROMPT = Template((Path(__file__).parent.parent / "ai/prompts/tag_inspiration.md").read_text())
POST_TYPES = {"launch", "progress", "lesson", "opinion", "tip", "humor", "question",
              "milestone", "story", "other"}  # fmt: skip
HOOK_TYPES = {"bold_claim", "mistake_story", "numbered_list", "before_after", "question",
              "story", "how_to", "announcement", "observation", "other"}  # fmt: skip
GOALS = {"teach", "sell", "hire", "network", "announce"}
MAX_CHARS = 1500  # per post in the tagging prompt; the shape shows in the first part
MIN_CHARS = 40  # shorter posts have no structure worth learning


@dataclass(frozen=True)
class NewPost:
    platform: str
    author: str
    text: str
    reactions: int = 0


def best_per_author(posts: list[NewPost], per_author: int) -> list[NewPost]:
    """Each author's most-liked posts that are long enough to have a structure. A big channel
    has thousands; a few dozen show its shapes, and tagging every one would spend days of
    free LLM quota."""
    by_author: dict[tuple[str, str], list[NewPost]] = {}
    for p in posts:
        if len(p.text.strip()) >= MIN_CHARS:
            by_author.setdefault((p.platform, p.author), []).append(p)
    out: list[NewPost] = []
    for group in by_author.values():
        group.sort(key=lambda p: p.reactions, reverse=True)
        out += group[:per_author]
    return out


def text_hash(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()


def add_posts(posts: list[NewPost]) -> int:
    """Store creators' posts; a post already in the pool (same platform and text) is skipped.
    Returns how many were new."""
    rows = [
        {
            "platform": p.platform,
            "post_type": "other",  # set by tagging
            "position": 0,
            "source": "creator",
            "author": p.author[:64],
            "text": p.text.strip(),
            "text_hash": text_hash(p.text.strip()),
        }
        for p in posts
        if len(p.text.strip()) >= MIN_CHARS
    ]
    added = 0
    with user_session(NOBODY) as s:
        for start in range(0, len(rows), 500):  # Postgres allows 65,535 parameters a statement
            result = s.execute(
                insert(ExemplarPost)
                .values(rows[start : start + 500])
                .on_conflict_do_nothing(index_elements=["platform", "text_hash"])
                .returning(ExemplarPost.id)
            )
            added += len(result.all())
    return added


@dataclass(frozen=True)
class TagReport:
    tagged: int
    remaining: int
    stopped_reason: str | None = None


def tag_pending(
    ai: AIClient | None = None, batch: int = 8, limit: int = 10_000, pause: float = 2.0
) -> TagReport:
    """Label untagged posts, `batch` per LLM call. Stops cleanly when the AI is unavailable."""
    ai = ai or default_client()
    done, reason = 0, None
    while done < limit:
        with user_session(NOBODY) as s:
            rows = s.execute(
                select(ExemplarPost.id, ExemplarPost.text)
                .where(ExemplarPost.tagged_at.is_(None))
                .order_by(ExemplarPost.platform, ExemplarPost.id)
                .limit(min(batch, limit - done))
            ).all()
        if not rows:
            break
        try:
            result = ai.generate(tag_prompt([r.text for r in rows]), purpose="tag_inspiration",
                                 temperature=0.0)  # fmt: skip
        except AIUnavailable as e:
            reason = str(e)
            break
        tags = parse_tags(result.text, len(rows))
        now = datetime.now(UTC)
        with user_session(NOBODY) as s:
            for i, row in enumerate(rows):
                t = tags.get(i)
                values = {"tagged_at": now}  # an unreadable answer still marks it, never loops
                if t:
                    values |= t
                s.execute(update(ExemplarPost).where(ExemplarPost.id == row.id).values(values))
        done += len(rows)
        if pause:
            time.sleep(pause)  # Groq's free tier allows a few calls a minute
    with user_session(NOBODY) as s:
        remaining = s.scalar(
            select(func.count()).select_from(ExemplarPost).where(ExemplarPost.tagged_at.is_(None))
        )
    return TagReport(done, remaining, reason)


def tag_prompt(texts: list[str]) -> str:
    posts = "\n\n".join(f"### Post {i}\n{t[:MAX_CHARS]}" for i, t in enumerate(texts))
    return TAG_PROMPT.substitute(posts=posts)


def parse_tags(answer: str, count: int) -> dict[int, dict]:
    """The model's JSON, checked field by field. Anything unknown becomes NULL, not a guess."""
    match = re.search(r"\[.*\]", answer, re.DOTALL)
    try:
        items = json.loads(match.group(0)) if match else []
    except json.JSONDecodeError:
        items = []
    out: dict[int, dict] = {}
    for item in items if isinstance(items, list) else []:
        if not isinstance(item, dict) or not isinstance(item.get("i"), int):
            continue
        i = item["i"]
        if not 0 <= i < count:
            continue

        out[i] = {
            "post_type": _pick(item, "post_type", POST_TYPES) or "other",
            "hook_type": _pick(item, "hook_type", HOOK_TYPES),
            "structure": _short(item, "structure", 300),
            "tone": _short(item, "tone", 32),
            "goal": _pick(item, "goal", GOALS),
            "source_profession": _short(item, "source_profession", 48),
        }
    return out


def _pick(item: dict, key: str, allowed: set[str]) -> str | None:
    v = str(item.get(key) or "").strip().lower()
    return v if v in allowed else None


def _short(item: dict, key: str, n: int) -> str | None:
    v = " ".join(str(item.get(key) or "").split())
    return v[:n] or None


@dataclass(frozen=True)
class EmbedReport:
    embedded: int
    remaining: int


def _needs_vectors(model: str):
    return or_(
        ExemplarPost.embedding.is_(None),
        ExemplarPost.embedding_model.is_distinct_from(model),
        ExemplarPost.structure.is_not(None) & ExemplarPost.structure_embedding.is_(None),
    )


def embed_pending(embedder: LocalEmbedder | None = None, batch: int = 64) -> EmbedReport:
    """Embed each post and its structure line with the local model. Rows already embedded
    with this model are skipped, so it can run any number of times."""
    embedder = embedder or local_embedder()
    model = embedder.model_name
    done = 0
    while True:
        with user_session(NOBODY) as s:
            rows = s.execute(
                select(ExemplarPost.id, ExemplarPost.text, ExemplarPost.structure)
                .where(_needs_vectors(model))
                .order_by(ExemplarPost.id)
                .limit(batch)
            ).all()
        if not rows:
            break
        texts = embedder.embed_passages([r.text for r in rows])
        with_structure = [r for r in rows if r.structure]
        shapes = embedder.embed_passages([r.structure for r in with_structure])
        shape_of = {r.id: v for r, v in zip(with_structure, shapes, strict=True)}
        with user_session(NOBODY) as s:
            for r, v in zip(rows, texts, strict=True):
                s.execute(
                    update(ExemplarPost)
                    .where(ExemplarPost.id == r.id)
                    .values(
                        embedding=v,
                        structure_embedding=shape_of.get(r.id),
                        embedding_model=model,
                    )
                )
        done += len(rows)
    return EmbedReport(done, 0)
