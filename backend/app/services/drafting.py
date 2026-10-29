"""Topic → draft in the user's voice (FR-7, FR-19, FR-31, NFR-15).

The chain: find the user's closest posts (voice), build the prompt from the template with
only the given facts and the platform's rules, ask the model chain, then save the draft,
its first version and the exact prompt. AI calls happen outside database transactions.
"""

import logging
import re
import uuid
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from string import Template

from sqlalchemy import func, select

from app.ai.client import AIClient, AIUnavailable, GenerationResult, default_client
from app.checks import invented_numbers, longest_copy
from app.core.db import user_session
from app.counting import post_length
from app.models import (
    Checkin,
    Draft,
    DraftMessage,
    DraftVersion,
    PlatformProfile,
    PromptLog,
    Thread,
)
from app.services.profile import get_profile
from app.services.retrieval import Example, find_examples
from app.services.usage import LimitReached, check_drafts
from app.services.voice import effective_limit, voice_card

TEMPLATE = Template((Path(__file__).parents[1] / "ai" / "prompts" / "draft.md").read_text())
PLATFORM_NAMES = {"telegram": "Telegram", "x": "X", "linkedin": "LinkedIn"}
COUNTING_NOTES = {
    "plain": "every character counts as one",
    "x_weighted": "links count as 23; emoji and non-Latin scripts such as Amharic count as 2",
}
EXAMPLE_MAX_CHARS = 1200


class DraftError(Exception):
    """Something the user can fix. `code` is the API error code (docs/API.md)."""

    def __init__(self, code: str, message: str, status: int = 400) -> None:
        super().__init__(message)
        self.code, self.message, self.status = code, message, status


@dataclass(frozen=True)
class DraftResult:
    draft_id: uuid.UUID
    thread_id: uuid.UUID
    text: str
    length: int
    char_limit: int
    over_limit: bool
    model: str
    model_version: str | None
    examples: list[Example]
    created_at: datetime


def build_prompt(
    profile: PlatformProfile,
    examples: list[Example],
    topic: str,
    about: str = "",
    language: str = "auto",
    voice: str = "",
    adapt_from: str | None = None,
    adapt_approved: bool = False,
) -> str:
    blocks = []
    if voice.strip():
        # FR-5: the user's reviewed voice card goes before the examples. Empty = no change.
        blocks.append(
            f"Their own notes on how they write here (reviewed by them):\n{voice.strip()}"
        )
    for i, e in enumerate(examples, 1):
        text = e.text if len(e.text) <= EXAMPLE_MAX_CHARS else e.text[:EXAMPLE_MAX_CHARS] + "…"
        blocks.append(f"[{i}]\n{text}")
    return TEMPLATE.substitute(
        platform_name=PLATFORM_NAMES[profile.platform],
        example_count=len(examples),
        examples="\n\n".join(blocks),
        facts=_facts(topic, about, language, adapt_from, adapt_approved),
        char_limit=profile.char_limit,
        counting_note=COUNTING_NOTES.get(profile.counting_rule, profile.counting_rule),
        tone_notes=profile.tone_notes,
        structure_notes=profile.structure_notes,
    )


def _facts(
    topic: str,
    about: str,
    language: str,
    adapt_from: str | None = None,
    adapt_approved: bool = False,
) -> str:
    """FR-19: the only facts a draft may state: the user's own summary card and today's topic.
    With no card and the default language, this is exactly the Phase 1 facts block.
    `adapt_from` is the same post written for another platform (FR-40). Only once the user
    approved it are its facts theirs (rule 10); before that it's model output, so it shapes
    the wording only and adds no facts. Its sentences are never copied."""
    parts = []
    if about.strip():
        parts.append(
            f"About the writer (their own summary card, approved by them):\n{about.strip()}"
        )
    if topic.strip():
        parts.append(f"Today's check-in or topic:\n{topic.strip()}")
    else:
        # "Generate post" with an empty box: write from what Voxlace knows about them.
        parts.append(
            "Today's check-in or topic:\n(none today: pick one thing from the summary card above "
            "and write about it)"
        )
    if adapt_from and adapt_from.strip():
        status = (
            "approved by the writer, so its facts may be used"
            if adapt_approved
            else "not approved yet: use it for what the post is about, but state only facts "
            "from the summary card and the check-in above"
        )
        parts.append(
            f"The same post, already written for another platform ({status}; write it fresh "
            "for this platform's readers and rules, don't copy its sentences):\n"
            + adapt_from.strip()
        )
    if language and language != "auto":
        parts.append(f"Write the post in {language}.")  # FR-24
    return "\n\n".join(parts)


def thread_title(text: str) -> str:
    """A thread's name in the sidebar: the first line of what the user wrote, cut short."""
    first = next((line.strip() for line in text.splitlines() if line.strip()), "")
    return first if len(first) <= 60 else first[:59].rstrip() + "…"


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


logger = logging.getLogger(__name__)

COPY_LIMIT = 8  # words in a row shared with one example post


def _badness(text: str, topic: str, examples: list[Example]) -> tuple[int, int]:
    """Lower is better: invented numbers first (facts matter most), then the copied run."""
    copied = len(longest_copy(text, [e.text for e in examples]))
    return len(invented_numbers(text, topic)), copied if copied >= COPY_LIMIT else 0


def _problems(text: str, topic: str, examples: list[Example]) -> list[str]:
    """What's wrong with a draft, as instructions for one rewrite (empty when it's fine)."""
    problems = []
    copied = longest_copy(text, [e.text for e in examples])
    if len(copied) >= COPY_LIMIT:
        problems.append(
            f'It reused these words from an example: "{" ".join(copied)}". '
            "Say it in your own words."
        )
    numbers = invented_numbers(text, topic)
    if numbers:
        problems.append(
            f"It used numbers that aren't in the facts: {', '.join(numbers)}. Remove them."
        )
    return problems


def _rewrite_if_needed(ai, prompt, result, text, topic, examples):
    """The prompt forbids copying and invented numbers, but models still slip sometimes.
    If they do, ask once more and say exactly what to fix. The log keeps the prompt that
    made the saved text. A failed or no-better retry keeps the first draft."""
    problems = _problems(text, topic, examples)
    if not problems:
        return prompt, result, text
    retry = prompt + "\n\n## Fix your first try\n" + "\n".join(f"- {p}" for p in problems)
    try:
        second = ai.generate(retry, purpose="draft_rewrite")
    except AIUnavailable:
        return prompt, result, text
    second_text = clean_output(second.text)
    before, after = _badness(text, topic, examples), _badness(second_text, topic, examples)
    # Counts only: never log post text (CLAUDE.md, security and privacy).
    logger.info("draft rewrite: invented numbers/copied words %s -> %s", before, after)
    if after >= before:
        return prompt, result, text
    return retry, second, second_text


def _check_limit(user_id: uuid.UUID) -> None:
    """FR-30, before any AI call. 429 like the AI's own rate limit; the input is kept."""
    try:
        check_drafts(user_id)
    except LimitReached as e:
        raise DraftError("daily_limit", e.message, 429) from e


def generate_draft(
    user_id: uuid.UUID,
    platform: str,
    topic: str,
    ai: AIClient | None = None,
    checkin_id: uuid.UUID | None = None,
    thread_id: uuid.UUID | None = None,
    adapt_from: str | None = None,
    source_draft_id: uuid.UUID | None = None,
    adapt_approved: bool = False,
) -> DraftResult:
    """Write one draft and put it in a thread as a card (FR-46): in `thread_id`, or in a new
    thread of its own when none is given."""
    about = get_profile(user_id)
    topic = (topic or "").strip()
    if not topic and not adapt_from and not about.summary_card.strip():
        raise DraftError(
            "missing_topic",
            "Write what you did today, or fill in your summary card in Profile first.",
        )
    _check_limit(user_id)
    ai = ai or default_client()

    with user_session(user_id) as s:
        if checkin_id is not None and s.get(Checkin, checkin_id) is None:  # RLS: own rows only
            raise DraftError("not_found", "That check-in doesn't exist.", 404)
        if thread_id is not None and s.get(Thread, thread_id) is None:
            raise DraftError("not_found", "That chat doesn't exist.", 404)
        profile = s.get(PlatformProfile, platform)
        if profile is None:
            raise DraftError("unknown_platform", f"Unknown platform: {platform}")
        s.expunge(profile)

    # With an empty box, the summary card is what the examples should be close to.
    examples = find_examples(user_id, platform, topic or about.summary_card[:1000], ai=ai)
    if not examples:
        raise DraftError(
            "no_posts",
            f"No {PLATFORM_NAMES[platform]} posts are ready yet. Import your export first, "
            "then wait until they're learned.",
        )

    prompt = build_prompt(
        profile,
        examples,
        topic,
        about.summary_card,
        about.language,
        voice_card(user_id, platform),
        adapt_from,
        adapt_approved,
    )
    result: GenerationResult = ai.generate(prompt, purpose="draft")
    text = clean_output(result.text)
    if not text:
        raise AIUnavailable("the model returned nothing")  # 503; nothing is saved
    # Numbers from the summary card are given facts too, not inventions. An unapproved
    # source draft is model output: a number it made up must not count as a fact (rule 10).
    facts = f"{topic}\n{about.summary_card}\n{adapt_from if adapt_approved else ''}"
    prompt, result, text = _rewrite_if_needed(ai, prompt, result, text, facts, examples)
    length = post_length(text, profile.counting_rule)
    # Q31: the prompt keeps asking for the short limit; Premium only raises the block (FR-9).
    limit = effective_limit(user_id, profile)

    with user_session(user_id) as s:
        if thread_id is None:
            title = thread_title(topic or text)
            thread = Thread(user_id=user_id, title=title, checkin_id=checkin_id)
            s.add(thread)
            s.flush()
            thread_id = thread.id
        else:
            s.get(Thread, thread_id).updated_at = func.now()
        draft = Draft(
            user_id=user_id,
            platform=platform,
            topic=topic,
            checkin_id=checkin_id,
            thread_id=thread_id,
            source_draft_id=source_draft_id,
        )
        s.add(draft)
        s.flush()
        version = DraftVersion(
            user_id=user_id, draft_id=draft.id, text=text, model=result.model_version
        )
        s.add(version)
        s.flush()
        s.add(  # the draft card in the thread
            DraftMessage(
                user_id=user_id,
                thread_id=thread_id,
                draft_id=draft.id,
                role="assistant",
                text="",
                draft_version_id=version.id,
            )
        )
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
        thread_id=thread_id,
        text=text,
        length=length,
        char_limit=limit,
        over_limit=length > limit,
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
