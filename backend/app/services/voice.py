"""Voice per platform: style stats, the voice card and the user's platform settings
(FR-5, FR-22, FR-26, Q31).

The stats are measured from the user's own posts every time they're asked for, so they always
match what's imported. The voice card is written by the AI from those stats and a sample of
posts, then edited by the user. Lines the user changed by hand survive a rewrite (FR-26).
"""

import re
import statistics
import uuid
from collections import Counter
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from string import Template

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert

from app.ai.client import AIClient, default_client
from app.core.db import user_session
from app.counting import post_length
from app.models import PlatformProfile, PlatformSettings, SourcePost, VoiceCard
from app.services.profile import get_profile

TEMPLATE = Template((Path(__file__).parents[1] / "ai" / "prompts" / "voice.md").read_text())
PLATFORM_NAMES = {"telegram": "Telegram", "x": "X", "linkedin": "LinkedIn"}

THIN = 20  # FR-5: fewer posts than this and the voice may be off
X_PREMIUM_LIMIT = 25_000  # Q31: X's limit with Premium; the counting rule doesn't change
SAMPLE_POSTS = 15
SAMPLE_CHARS = 600

HASHTAG = re.compile(r"(?<!\w)#\w+")
LINK = re.compile(r"https?://\S+")
ETHIOPIC = re.compile(r"[ሀ-፿]")
EMOJI = re.compile(r"[\U0001F300-\U0001FAFF☀-➿]")


@dataclass(frozen=True)
class Stats:
    post_count: int = 0
    median_length: int = 0
    median_lines: int = 0
    emoji_share: float = 0.0  # share of posts with at least one emoji, 0–1
    hashtag_share: float = 0.0
    link_share: float = 0.0
    question_share: float = 0.0
    ethiopic_share: float = 0.0  # share of posts with Amharic (or other Ethiopic) text
    top_hashtags: list[str] = field(default_factory=list)

    @property
    def thin(self) -> bool:
        return self.post_count < THIN


def measure(texts: list[str], counting_rule: str) -> Stats:
    """Pure: the numbers on the voice card, from the posts' text only."""
    if not texts:
        return Stats()
    n = len(texts)

    def share(pattern: re.Pattern[str]) -> float:
        return round(sum(1 for t in texts if pattern.search(t)) / n, 2)

    tags = Counter(tag.lower() for t in texts for tag in HASHTAG.findall(t))
    return Stats(
        post_count=n,
        median_length=int(statistics.median(post_length(t, counting_rule) for t in texts)),
        median_lines=int(
            statistics.median(len([ln for ln in t.splitlines() if ln.strip()]) for t in texts)
        ),
        emoji_share=share(EMOJI),
        hashtag_share=share(HASHTAG),
        link_share=share(LINK),
        question_share=round(sum(1 for t in texts if "?" in t) / n, 2),
        ethiopic_share=share(ETHIOPIC),
        top_hashtags=[tag for tag, _ in tags.most_common(5)],
    )


def kept_lines(card: str, ai_card: str) -> list[str]:
    """FR-26: the card's lines that the AI didn't write, i.e. the user's hand edits."""
    written = {ln.strip() for ln in ai_card.splitlines() if ln.strip()}
    return [ln.strip() for ln in card.splitlines() if ln.strip() and ln.strip() not in written]


def merge_kept(new_card: str, kept: list[str]) -> str:
    """Keep every hand-edited line, even if the model dropped one."""
    present = {ln.strip() for ln in new_card.splitlines()}
    missing = [ln for ln in kept if ln not in present]
    return "\n".join([new_card.strip(), *missing]).strip()


@dataclass(frozen=True)
class PlatformView:
    platform: str
    rules: PlatformProfile
    stats: Stats
    card: str
    card_updated_at: datetime | None
    x_premium: bool | None
    premium_source: str | None

    @property
    def effective_limit(self) -> int:
        return X_PREMIUM_LIMIT if self.platform == "x" and self.x_premium else self.rules.char_limit


def _texts(s, user_id: uuid.UUID, platform: str) -> list[str]:
    return list(
        s.scalars(
            select(SourcePost.text).where(
                SourcePost.user_id == user_id,
                SourcePost.platform == platform,
                SourcePost.excluded.is_(False),
            )
        ).all()
    )


def view(user_id: uuid.UUID, platform: str) -> PlatformView:
    with user_session(user_id) as s:
        rules = s.get(PlatformProfile, platform)
        card = s.get(VoiceCard, (user_id, platform))
        settings = s.get(PlatformSettings, (user_id, platform))
        texts = _texts(s, user_id, platform)
        s.expunge(rules)
    return PlatformView(
        platform=platform,
        rules=rules,
        stats=measure(texts, rules.counting_rule),
        card=card.card if card else "",
        card_updated_at=card.updated_at if card else None,
        x_premium=settings.x_premium if settings else None,
        premium_source=settings.premium_source if settings else None,
    )


def voice_card(user_id: uuid.UUID, platform: str) -> str:
    with user_session(user_id) as s:
        card = s.get(VoiceCard, (user_id, platform))
        return card.card if card else ""


def effective_limit(user_id: uuid.UUID, rules: PlatformProfile) -> int:
    if rules.platform != "x":
        return rules.char_limit
    with user_session(user_id) as s:
        settings = s.get(PlatformSettings, (user_id, "x"))
        return X_PREMIUM_LIMIT if settings and settings.x_premium else rules.char_limit


def _save_card(user_id: uuid.UUID, platform: str, **values: str) -> None:
    with user_session(user_id) as s:
        s.execute(
            insert(VoiceCard)
            .values(user_id=user_id, platform=platform, **values)
            .on_conflict_do_update(
                index_elements=["user_id", "platform"],
                set_={**values, "updated_at": datetime.now(UTC)},
            )
        )


def edit_card(user_id: uuid.UUID, platform: str, card: str) -> None:
    _save_card(user_id, platform, card=card.strip())


def _sample(s, user_id: uuid.UUID, platform: str) -> list[str]:
    """Pinned posts first, then the most liked, then the newest."""
    return list(
        s.scalars(
            select(SourcePost.text)
            .where(
                SourcePost.user_id == user_id,
                SourcePost.platform == platform,
                SourcePost.excluded.is_(False),
            )
            .order_by(
                SourcePost.pinned.desc(), SourcePost.likes.desc(), SourcePost.posted_at.desc()
            )
            .limit(SAMPLE_POSTS)
        ).all()
    )


def describe(stats: Stats) -> str:
    pct = lambda x: f"{round(x * 100)}%"  # noqa: E731
    lines = [
        f"- Typical length: {stats.median_length} characters, {stats.median_lines} lines",
        f"- Posts with emoji: {pct(stats.emoji_share)}",
        f"- Posts with hashtags: {pct(stats.hashtag_share)}",
        f"- Posts with links: {pct(stats.link_share)}",
        f"- Posts with a question: {pct(stats.question_share)}",
        f"- Posts with Amharic (Ethiopic script): {pct(stats.ethiopic_share)}",
    ]
    if stats.top_hashtags:
        lines.append(f"- Most used hashtags: {', '.join(stats.top_hashtags)}")
    return "\n".join(lines)


def card_prompt(
    platform: str, stats: Stats, posts: list[str], kept: list[str], language: str
) -> str:
    sample = "\n\n".join(
        f"[{i}]\n{p if len(p) <= SAMPLE_CHARS else p[:SAMPLE_CHARS] + '…'}"
        for i, p in enumerate(posts, 1)
    )
    return TEMPLATE.substitute(
        platform_name=PLATFORM_NAMES[platform],
        post_count=stats.post_count,
        stats=describe(stats),
        posts=sample,
        kept="\n".join(kept) or "(none)",
        language_rule=(
            f"- Write the lines in {language}." if language and language != "auto" else ""
        ),
    )


class NoPosts(Exception):
    """There's nothing to learn a voice from yet."""


def write_card(user_id: uuid.UUID, platform: str, ai: AIClient | None = None) -> None:
    """FR-5, FR-26: the AI rewrites the card; the user's own lines stay."""
    with user_session(user_id) as s:
        rules = s.get(PlatformProfile, platform)
        texts = _texts(s, user_id, platform)
        posts = _sample(s, user_id, platform)
        old = s.get(VoiceCard, (user_id, platform))
        kept = kept_lines(old.card, old.ai_card) if old else []
        counting_rule = rules.counting_rule
    if not texts:
        raise NoPosts
    language = get_profile(user_id).language
    prompt = card_prompt(platform, measure(texts, counting_rule), posts, kept, language)
    result = (ai or default_client()).generate(prompt, purpose="voice_card")
    ai_text = result.text.strip()
    _save_card(user_id, platform, card=merge_kept(ai_text, kept), ai_card=ai_text)


def set_premium(user_id: uuid.UUID, value: bool | None, source: str) -> None:
    """Q31. The user's answer always wins; a guess from the export never overwrites it."""
    with user_session(user_id) as s:
        current = s.get(PlatformSettings, (user_id, "x"))
        if source == "export" and current is not None and current.premium_source == "user":
            return
        s.execute(
            insert(PlatformSettings)
            .values(user_id=user_id, platform="x", x_premium=value, premium_source=source)
            .on_conflict_do_update(
                index_elements=["user_id", "platform"],
                set_={
                    "x_premium": value,
                    "premium_source": source,
                    "updated_at": datetime.now(UTC),
                },
            )
        )
