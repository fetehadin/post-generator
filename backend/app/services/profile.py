"""The About-you form and the summary card (FR-17, FR-18, FR-24, FR-33, FR-44).

The summary card is written by the AI from the user's own answers (and a few of their posts,
for topics and tone), then shown to the user, who can edit it. Drafts may state facts only
from this card and the day's topic (FR-19).
"""

import uuid
from datetime import UTC, datetime
from pathlib import Path
from string import Template

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert

from app.ai.client import AIClient, default_client
from app.core.db import user_session
from app.importers.common import DEFAULT_EXCLUDED_HASHTAGS
from app.models import Profile, SourcePost
from app.services.uploads import reviewed_texts

TEMPLATE = Template((Path(__file__).parents[1] / "ai" / "prompts" / "summary.md").read_text())

# Label shown to the AI for each answer, in form order (FR-17, FR-33).
FIELDS = {
    "role": "Role",
    "stack": "Stack and tools",
    "current_projects": "Current projects",
    "focus": "Focus",
    "goal": "Posting goal",
    "topics": "Topics they post about",
    "audience": "Audience (who and where)",
    "avoid_list": "Things to avoid",
    "voice_words": "Words that describe their voice",
    "links": "Links",
    "discipline": "Discipline",
    "usual_hours": "When they usually post",
    "seniority": "Seniority",
    "facts": "Facts they are happy to share",
    "emoji_habit": "Emoji habits",
    "hashtag_habit": "Hashtag habits",
    "portfolio_url": "Portfolio",
}
PROJECT_STATUSES = ("idea", "building", "live", "paused")
UPLOAD_CHARS = 4000  # per reviewed upload in the summary prompt
UPLOAD_LABELS = {"resume": "Resume", "portfolio": "Portfolio page"}
SAMPLE_POSTS = 5
SAMPLE_CHARS = 300


def get_profile(user_id: uuid.UUID) -> Profile:
    with user_session(user_id) as s:
        s.execute(insert(Profile).values(user_id=user_id).on_conflict_do_nothing())
        profile = s.get(Profile, user_id)
        s.expunge(profile)
        return profile


def update_profile(user_id: uuid.UUID, changes: dict) -> Profile:
    get_profile(user_id)  # make sure the row exists
    with user_session(user_id) as s:
        profile = s.get(Profile, user_id)
        for name, value in changes.items():
            if name == "summary_card":
                profile.summary_updated_at = datetime.now(UTC)
            setattr(profile, name, value)
        s.flush()
        s.refresh(profile)
        s.expunge(profile)
        return profile


def excluded_hashtags(user_id: uuid.UUID) -> list[str]:
    """FR-44: the user's own list, or the default list until they edit it."""
    tags = get_profile(user_id).excluded_hashtags
    return list(DEFAULT_EXCLUDED_HASHTAGS) if tags is None else tags


def summary_prompt(
    profile: Profile, posts: list[str], uploads: list[tuple[str, str]] | None = None
) -> str:
    lines = [
        f"- {label}: {getattr(profile, name).strip()}"
        for name, label in FIELDS.items()
        if getattr(profile, name).strip()
    ]
    for p in profile.projects or []:
        details = ", ".join(x for x in (p.get("line"), p.get("status"), p.get("link")) if x)
        lines.append(f"- Project: {p['name']}" + (f" ({details})" if details else ""))
    sample = "\n\n".join(p if len(p) <= SAMPLE_CHARS else p[:SAMPLE_CHARS] + "…" for p in posts)
    # FR-20, FR-21: reviewed resume/portfolio text, contacts already removed. With none, the
    # prompt is exactly as before.
    extra = "".join(
        f"\n\n## From their {UPLOAD_LABELS.get(kind, kind).lower()} "
        f"(contact details removed, reviewed by them)\n{text[:UPLOAD_CHARS]}"
        for kind, text in uploads or []
    )
    return TEMPLATE.substitute(
        answers=("\n".join(lines) or "(nothing yet)") + extra,
        posts=sample or "(no posts imported yet)",
    )


def write_summary(user_id: uuid.UUID, ai: AIClient | None = None) -> Profile:
    """FR-18: draft the ~150-word card from the answers and a few of the user's best posts."""
    profile = get_profile(user_id)
    with user_session(user_id) as s:
        posts = s.scalars(
            select(SourcePost.text)
            .where(SourcePost.user_id == user_id, SourcePost.excluded.is_(False))
            .order_by(
                SourcePost.pinned.desc(), SourcePost.likes.desc(), SourcePost.posted_at.desc()
            )
            .limit(SAMPLE_POSTS)
        ).all()
    result = (ai or default_client()).generate(
        summary_prompt(profile, list(posts), reviewed_texts(user_id)), purpose="summary"
    )
    return update_profile(user_id, {"summary_card": result.text.strip()})
