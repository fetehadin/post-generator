"""The editor's chat: an instruction revises the current draft into a new version, or the
assistant asks a question instead of inventing a fact (FR-10, FR-40).

A selected sentence scopes the change: the model rewrites only that part, and we put it back
into the post ourselves, so the rest of the text can't drift.
"""

import uuid
from datetime import UTC, datetime
from pathlib import Path
from string import Template

from app.ai.client import AIClient, default_client
from app.core.db import user_session
from app.models import Draft, DraftMessage, PlatformProfile, PromptLog
from app.services.drafting import (
    COUNTING_NOTES,
    PLATFORM_NAMES,
    DraftError,
    _facts,
    clean_output,
)
from app.services.library import DraftDetail, add_version, detail
from app.services.profile import get_profile
from app.services.voice import voice_card

TEMPLATE = Template((Path(__file__).parents[1] / "ai" / "prompts" / "revise.md").read_text())
QUESTION = "QUESTION:"


def revise_prompt(
    rules: PlatformProfile,
    current: str,
    instruction: str,
    topic: str,
    about: str,
    language: str,
    voice: str,
    selection: str | None,
) -> str:
    scope = ""
    what = "the whole revised post"
    if selection:
        scope = (
            f"\nChange ONLY this part of the post and keep its meaning in context:\n{selection}\n"
        )
        what = "the new version of that part, nothing else"
    return TEMPLATE.substitute(
        platform_name=PLATFORM_NAMES[rules.platform],
        voice=voice.strip() or "Keep the style of the current post.",
        facts=_facts(topic, about, language),
        current=current,
        instruction=instruction.strip(),
        scope=scope,
        char_limit=rules.char_limit,
        counting_note=COUNTING_NOTES.get(rules.counting_rule, rules.counting_rule),
        tone_notes=rules.tone_notes,
        structure_notes=rules.structure_notes,
        what=what,
    )


def revise(
    user_id: uuid.UUID,
    draft_id: uuid.UUID,
    instruction: str,
    selection: str | None = None,
    ai: AIClient | None = None,
) -> DraftDetail:
    if not instruction.strip():
        raise DraftError("missing_instruction", "Tell it what to change.")
    current = detail(user_id, draft_id)
    d = current.draft
    if d.status != "draft":
        raise DraftError("not_editable", "Move it back to draft before you change the text.", 409)
    selection = (selection or "").strip() or None
    if selection and selection not in current.text:
        raise DraftError("selection_changed", "That text isn't in the draft any more.")

    with user_session(user_id) as s:
        rules = s.get(PlatformProfile, d.platform)
        s.expunge(rules)
    about = get_profile(user_id)
    prompt = revise_prompt(
        rules,
        current.text,
        instruction,
        d.topic,
        about.summary_card,
        about.language,
        voice_card(user_id, d.platform),
        selection,
    )
    result = (ai or default_client()).generate(prompt, purpose="revise")  # outside any transaction
    answer = clean_output(result.text)

    with user_session(user_id) as s:
        draft = s.get(Draft, draft_id)
        s.add(
            DraftMessage(user_id=user_id, draft_id=draft_id, role="user", text=instruction.strip())
        )
        s.flush()
        version = None
        if answer.upper().startswith(QUESTION):
            reply = answer[len(QUESTION) :].strip()
        else:
            text = current.text.replace(selection, answer, 1) if selection else answer
            version = add_version(
                s, user_id, draft, text, instruction.strip(), result.model_version
            )
            reply = f"v{len(current.versions) + 1}: {instruction.strip()}"
        s.add(
            DraftMessage(
                user_id=user_id,
                draft_id=draft_id,
                role="assistant",
                text=reply,
                draft_version_id=version.id if version else None,
                created_at=datetime.now(UTC),
            )
        )
        s.add(
            PromptLog(
                user_id=user_id,
                draft_id=draft_id,
                draft_version_id=version.id if version else None,
                prompt=prompt,
                model=result.model,
                model_version=result.model_version,
                provider=result.provider,
            )
        )
    return detail(user_id, draft_id)
