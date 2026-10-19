"""Topic → draft in the user's voice (FR-7, FR-19, FR-31, NFR-15).

The chain: find the user's closest posts (voice), build the prompt from the template with
only the given facts and the platform's rules, ask the model chain, then save the draft,
its first version and the exact prompt. AI calls happen outside database transactions.
"""

import re
import uuid
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from string import Template

from sqlalchemy import select

from app.ai.client import AIClient, GenerationResult, default_client
from app.core.db import user_session
from app.counting import post_length
from app.models import Draft, DraftVersion, PlatformProfile, PromptLog
from app.services.retrieval import Example, find_examples

TEMPLATE = Template((Path(__file__).parents[1] / "ai" / "prompts" / "draft.md").read_text())
PLATFORM_NAMES = {"telegram": "Telegram", "x": "X", "linkedin": "LinkedIn"}
COUNTING_NOTES = {
    "plain": "every character counts as one",
    "x_weighted": "links count as 23, most emoji and CJK characters as 2",
}
EXAMPLE_MAX_CHARS = 1200


class DraftError(Exception):
    """Something the user can fix. `code` is the API error code (docs/API.md)."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code, self.message = code, message


@dataclass(frozen=True)
class DraftResult:
    draft_id: uuid.UUID
    text: str
    length: int
    char_limit: int
    over_limit: bool
    model: str
    model_version: str | None
    examples: list[Example]
    created_at: datetime


def build_prompt(profile: PlatformProfile, examples: list[Example], topic: str) -> str:
    blocks = []
    for i, e in enumerate(examples, 1):
        text = e.text if len(e.text) <= EXAMPLE_MAX_CHARS else e.text[:EXAMPLE_MAX_CHARS] + "…"
        blocks.append(f"[{i}]\n{text}")
    return TEMPLATE.substitute(
        platform_name=PLATFORM_NAMES[profile.platform],
        example_count=len(examples),
        examples="\n\n".join(blocks),
        # Phase 1 has no profile yet; the summary card joins the facts in Phase 3 (FR-18, FR-19).
        facts=f"Today's check-in or topic:\n{topic.strip()}",
        char_limit=profile.char_limit,
        counting_note=COUNTING_NOTES.get(profile.counting_rule, profile.counting_rule),
        tone_notes=profile.tone_notes,
        structure_notes=profile.structure_notes,
    )


def clean_output(text: str) -> str:
    """Models sometimes wrap the post in quotes or a code block, or add a preface."""
    t = text.strip()
    t = re.sub(r"^```[a-z]*\n(.*)\n```$", r"\1", t, flags=re.DOTALL).strip()
    t = re.sub(r"^(here(?:'s| is) (?:the|your|a)[^\n:]*:)\s*\n", "", t, flags=re.IGNORECASE)
    if len(t) > 1 and t[0] == t[-1] and t[0] in "\"“”'":
        t = t[1:-1].strip()
    if t[:1] == "“" and t[-1:] == "”":
        t = t[1:-1].strip()
    return t


def generate_draft(
    user_id: uuid.UUID, platform: str, topic: str, ai: AIClient | None = None
) -> DraftResult:
    if not topic or not topic.strip():
        raise DraftError("missing_topic", "Write a topic or a check-in first.")
    ai = ai or default_client()

    with user_session(user_id) as s:
        profile = s.get(PlatformProfile, platform)
        if profile is None:
            raise DraftError("unknown_platform", f"Unknown platform: {platform}")
        s.expunge(profile)

    examples = find_examples(user_id, platform, topic, ai=ai)
    if not examples:
        raise DraftError(
            "no_posts",
            f"No {PLATFORM_NAMES[platform]} posts are ready yet. Import your export first, "
            "then wait until they're learned.",
        )

    prompt = build_prompt(profile, examples, topic)
    result: GenerationResult = ai.generate(prompt, purpose="draft")
    text = clean_output(result.text)
    length = post_length(text, profile.counting_rule)

    with user_session(user_id) as s:
        draft = Draft(user_id=user_id, platform=platform, topic=topic.strip())
        s.add(draft)
        s.flush()
        version = DraftVersion(
            user_id=user_id, draft_id=draft.id, text=text, model=result.model_version
        )
        s.add(version)
        s.flush()
        s.add(
            PromptLog(
                user_id=user_id,
                draft_id=draft.id,
                draft_version_id=version.id,
                prompt=prompt,
                model=result.model,
                model_version=result.model_version,
                provider=result.provider,
            )
        )
        s.flush()
        s.refresh(draft)  # load the database's created_at
        draft_id, created_at = draft.id, draft.created_at

    return DraftResult(
        draft_id=draft_id,
        text=text,
        length=length,
        char_limit=profile.char_limit,
        over_limit=length > profile.char_limit,
        model=result.model,
        model_version=result.model_version,
        examples=examples,
        created_at=created_at,
    )


def prompt_for(user_id: uuid.UUID, draft_id: uuid.UUID) -> PromptLog | None:
    """The exact prompt behind a draft's first version (debug view, NFR-15)."""
    with user_session(user_id) as s:
        log = s.scalars(
            select(PromptLog).where(PromptLog.draft_id == draft_id).order_by(PromptLog.created_at)
        ).first()
        if log is not None:
            s.expunge(log)
        return log
