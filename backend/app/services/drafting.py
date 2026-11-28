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

from app.ai.client import AIClient, AIUnavailable, GenerationResult, default_client, for_user
from app.ai.local_embed import cosine
from app.checks import invented_numbers, longest_copy
from app.core.config import get_settings
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
from app.services.retrieval import (
    Example,
    StructureExample,
    find_examples,
    inspiration,
    post_counts,
    structure_examples,
)
from app.services.usage import LimitReached, check_drafts
from app.services.voice import ETHIOPIC, effective_limit, voice_card

TEMPLATE = Template((Path(__file__).parents[1] / "ai" / "prompts" / "draft.md").read_text())
AMHARIC_RULES = (Path(__file__).parents[1] / "ai" / "prompts" / "amharic.md").read_text().strip()
PLATFORM_NAMES = {"telegram": "Telegram", "x": "X", "linkedin": "LinkedIn"}
COUNTING_NOTES = {
    "plain": "every character counts as one",
    "x_weighted": "links count as 23; emoji and non-Latin scripts such as Amharic count as 2",
}
EXAMPLE_MAX_CHARS = 1200
# The "match their voice" lines of the template, replaced when they have no posts.
NO_VOICE = re.compile(r"Below are 0 of their real past .*?sign-off\.", re.DOTALL)


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
    # Things the user should know about this draft, shown with it (FR-48, FR-49).
    notices: tuple[str, ...] = ()


def build_prompt(
    profile: PlatformProfile,
    examples: list[Example],
    topic: str,
    about: str = "",
    language: str = "auto",
    voice: str = "",
    adapt_from: str | None = None,
    adapt_approved: bool = False,
    pool: list[str] | None = None,
    shapes: list[StructureExample] | None = None,
    who: str = "",
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
    prompt = TEMPLATE.substitute(
        platform_name=PLATFORM_NAMES[profile.platform],
        example_count=len(examples),
        examples="\n\n".join(blocks) or "(none yet)",
        inspiration=_shapes(shapes, who) if shapes else _inspiration(profile.platform, pool or []),
        who=_who_block(who),
        facts=_facts(topic, about, language, adapt_from, adapt_approved),
        char_limit=profile.char_limit,
        counting_note=COUNTING_NOTES.get(profile.counting_rule, profile.counting_rule),
        tone_notes=profile.tone_notes,
        structure_notes=profile.structure_notes,
    )
    if not examples:
        # No posts of their own: there is no voice to match, so don't ask the model to.
        prompt = NO_VOICE.sub(
            f"They have no {PLATFORM_NAMES[profile.platform]} posts yet, so there is no voice "
            "to match: write plainly and naturally, in the language of the topic.",
            prompt,
            count=1,
        )
    return prompt


def with_amharic_rules(prompt: str) -> str:
    """FR-56: add the Amharic writing rules just before the output instruction, so they are
    the last thing the model reads about how to write."""
    head, sep, tail = prompt.rpartition("\n## Output")
    if not sep:
        return f"{prompt}\n\n{AMHARIC_RULES}"
    return f"{head}\n{AMHARIC_RULES}\n{sep}{tail}"


def amharic_first(examples: list[Example]) -> list[Example]:
    """FR-56: the user's posts with the most Amharic script first, as voice examples for an
    Amharic draft. The order stays the same among equals (sorted is stable)."""

    def share(e: Example) -> float:
        letters = [c for c in e.text if c.isalpha()]
        return sum(1 for c in letters if ETHIOPIC.match(c)) / len(letters) if letters else 0.0

    return sorted(examples, key=share, reverse=True)


def _inspiration(platform: str, pool: list[str]) -> str:
    """Shared example posts for a thin history: structure only. Empty = no change."""
    if not pool:
        return ""
    name = PLATFORM_NAMES[platform]
    posts = "\n\n".join(f"[{chr(65 + i)}]\n{p}" for i, p in enumerate(pool))
    return (
        f"\n\n## Inspiration (not their voice)\nThey have few or no {name} posts yet. These "
        f"are example {name} posts written by the Voxlace team, not by them. Learn only how a "
        "good post here is shaped: the first line, line breaks, length and ending. Parts in "
        "[brackets] are empty slots, not facts: fill them only from the facts below, or leave "
        "them out. Never use their wording or topics, and never add a call to action, an "
        "event, a link or an offer from them.\n\n" + posts
    )


AUDIENCES = {
    "peers": "peers in their own field",
    "clients": "clients and customers",
    "employers": "employers and recruiters",
    "public": "a general audience",
}
GOALS = {
    "teach": "teach something useful",
    "sell": "show what they offer",
    "hire": "find people to work with",
    "network": "connect with people",
    "announce": "share news",
}


def who_is_writing(profession: str, audience_kind: str = "", goal: str = "") -> str:
    """One plain line about the writer (FR-17, FR-41), or "" when nothing is known."""
    # Several professions are saved as "student, developer" (Profile chips) and read as
    # "student and developer".
    parts = [" ".join(p.split()) for p in profession.split(",")]
    parts = [p for p in parts if p]
    profession = (f"{', '.join(parts[:-1])} and {parts[-1]}" if len(parts) > 1 else "".join(parts))[
        :120
    ]
    if not profession:
        return ""
    line = f"They are a {profession}"
    if audience_kind in AUDIENCES:
        line += f", writing mostly for {AUDIENCES[audience_kind]}"
    if goal in GOALS:
        line += f", to {GOALS[goal]}"
    return line + "."


def _who_block(who: str) -> str:
    if not who:
        return ""
    return (
        f"## Who is writing\n{who} Use the words people in their field use with that "
        "audience. Never borrow another field's jargon.\n\n"
    )


def _shapes(shapes: list[StructureExample], who: str) -> str:
    """FR-41: other people's posts, for structure only. Each is labelled with its hook and its
    shape, so the model copies the pattern, not the words."""
    blocks = []
    for i, s in enumerate(shapes):
        label = " · ".join(
            x
            for x in (
                s.hook_type and f"hook: {s.hook_type.replace('_', ' ')}",
                s.structure and f"shape: {s.structure}",
            )
            if x
        )
        text = s.text if len(s.text) <= EXAMPLE_MAX_CHARS else s.text[:EXAMPLE_MAX_CHARS] + "…"
        blocks.append(f"[{chr(65 + i)}]" + (f" ({label})" if label else "") + f"\n{text}")
    field = "their field's" if who else "plain"
    return (
        "\n\n## Shape examples (not their voice, not their field)\n"
        "These posts were written by other people, often in other fields. Use them ONLY for "
        "the hook, the structure, the rhythm and the length. Never copy their phrases, topics, "
        "names, jargon, numbers, links or calls to action. Parts in [brackets] are empty "
        "slots. If a shape needs details the facts below don't give, pick a simpler shape: "
        "never fill a shape with invented scenes, times, people or results. Keep the length "
        f"to what the facts can fill. Write about the facts below, in {field} vocabulary.\n\n"
        + "\n\n".join(blocks)
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


TOO_CLOSE = "This draft is close to one of the example posts. Consider rewording it."


def _find_shapes(platform, idea, about, hook_type, embedder) -> list[StructureExample]:
    """Never stops a draft: with no local model or an empty pool, there are just none."""
    if not idea.strip():
        return []
    try:
        return structure_examples(
            platform, idea, about.discipline, about.main_goal, hook_type, embedder=embedder
        )
    except Exception:
        logger.exception("couldn't find structure examples; drafting without them")
        return []


def _closest(embedder, text: str, shapes: list[StructureExample]) -> tuple[int, float]:
    vector = embedder.embed_passages([text])[0]
    scores = [cosine(vector, s.embedding) for s in shapes]
    best = max(range(len(scores)), key=scores.__getitem__)
    return best, scores[best]


def _check_originality(ai, prompt, result, text, shapes, embedder):
    """FR-49: embed the draft and compare it with its shape examples. Too close: ask once
    more, naming the example; keep the less similar draft. Still too close: flag it (True).
    The local model failing never stops a draft."""
    shapes = [s for s in shapes if s.embedding]
    if not shapes:
        return prompt, result, text, False
    from app.ai.local_embed import local_embedder

    embedder = embedder or local_embedder()
    threshold = get_settings().originality_threshold
    try:
        i, score = _closest(embedder, text, shapes)
    except Exception:
        logger.exception("originality check failed; keeping the draft")
        return prompt, result, text, False
    if score < threshold:
        return prompt, result, text, False
    # Scores only, never text (CLAUDE.md, security and privacy).
    logger.info("draft too close to a shape example (%.3f); asking once more", score)
    retry = (
        prompt + "\n\n## Fix your first try\n"
        f"- It follows shape example [{chr(65 + i)}] too closely. Keep only its kind of hook "
        "and structure; say everything in your own words, about the facts above."
    )
    try:
        second = ai.generate(retry, purpose="draft_originality")
        second_text = clean_output(second.text)
        _, second_score = _closest(embedder, second_text, shapes)
    except Exception:
        return prompt, result, text, True
    if not second_text or second_score >= score:
        return prompt, result, text, True
    return retry, second, second_text, second_score >= threshold


def _check_limit(user_id: uuid.UUID) -> bool:
    """FR-30, before any AI call. 429 like the AI's own rate limit; the input is kept.
    True: today's limit is used up but the user's own key may go on, on their key only."""
    try:
        return check_drafts(user_id)
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
    hook_type: str | None = None,
    embedder=None,
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
    own_only = _check_limit(user_id)
    # The user's own keys first, then the app's (FR-48); past the limit, theirs only.
    ai = for_user(ai or default_client(), user_id, allow_default=not own_only)

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
    name = PLATFORM_NAMES[platform]
    counts = post_counts(user_id, platform)
    if counts.usable == 0 and counts.waiting:
        # Just imported: drafting now would ignore their voice entirely, so say so instead.
        raise DraftError(
            "posts_learning",
            f"Your {name} posts are still being learned. Try again in a few minutes.",
            409,
        )
    # With no usable posts there's nothing to search, so the topic isn't embedded.
    examples = (
        find_examples(user_id, platform, topic or about.summary_card[:1000], ai=ai)
        if counts.usable
        else []
    )
    # FR-41: 3 posts from the shared pool, for their structure only; for a non-developer,
    # matched by shape so the topic of dev posts can't leak in. Without the local model or an
    # embedded pool, a thin history falls back to the team's templates, as before (FR-5).
    who = who_is_writing(about.discipline, about.audience_kind, about.main_goal)
    shapes = _find_shapes(platform, topic or about.summary_card[:1000], about, hook_type, embedder)
    pool = inspiration(user_id, platform) if counts.thin and not shapes else []
    if not examples and not pool and not shapes:
        raise DraftError(
            "no_posts",
            f"No {name} posts are ready yet. Import your export first, "
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
        pool,
        shapes,
        who,
    )
    result: GenerationResult = ai.generate(prompt, purpose="draft")
    key_notice = result.notice  # FR-48: e.g. "Your key failed, used the free model instead."
    text = clean_output(result.text)
    if not text:
        raise AIUnavailable("the model returned nothing")  # 503; nothing is saved
    # Numbers from the summary card are given facts too, not inventions. An unapproved
    # source draft is model output: a number it made up must not count as a fact (rule 10).
    facts = f"{topic}\n{about.summary_card}\n{adapt_from if adapt_approved else ''}"
    # Inspiration sentences must not be copied either.
    copy_sources = examples + [
        Example(uuid.uuid4(), t, 0.0, False) for t in pool + [s.text for s in shapes]
    ]
    prompt, result, text = _rewrite_if_needed(ai, prompt, result, text, facts, copy_sources)
    notices: list[str] = [key_notice] if key_notice else []
    prompt, result, text, close = _check_originality(ai, prompt, result, text, shapes, embedder)
    if close:
        notices.append(TOO_CLOSE)
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
                key_source=result.key_source,
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
        notices=tuple(notices),
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
