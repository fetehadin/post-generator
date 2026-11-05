"""Guest mode (FR-47): draft without logging in, with nothing of the guest's stored.

A guest's check-in and drafts live only in their browser. Each draft comes back with a
*receipt*: the draft, the exact prompt that wrote it and the model, signed with our key. The
server keeps none of it. When the guest logs in, `claim` checks the signatures and saves the
drafts into their new account as one chat, with the prompt logs rule 9 asks for. A changed
receipt fails the check, so nobody can plant a made-up prompt log.

Guests have no posts, so drafts take their shape from the shared inspiration pool (FR-5) and
their facts only from what the guest wrote (rule 10). The only thing written to the database
before login is a counter per day and per hashed IP address, for the guest limits.
"""

import base64
import hashlib
import hmac
import json
import time
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, func, select, text

from app.ai.client import AIClient, AIUnavailable, EmbeddingUnavailable, default_client
from app.core.config import get_settings
from app.core.db import user_session
from app.counting import post_length
from app.models import (
    Checkin,
    Draft,
    DraftMessage,
    DraftVersion,
    GuestUsage,
    PlatformProfile,
    PromptLog,
    Thread,
)
from app.services.clock import local_today
from app.services.drafting import (
    PLATFORM_NAMES,
    DraftError,
    _problems,
    _rewrite_if_needed,
    build_prompt,
    clean_output,
    thread_title,
)
from app.services.retrieval import Example, inspiration
from app.services.revising import QUESTION, revise_prompt
from app.services.threads import AI_BUSY, ThreadDetail, detail

# No user: shared tables only (platform rules, the inspiration pool). Under RLS this id owns
# nothing, so a guest query that touched user tables would see 0 rows (fails closed).
NOBODY = uuid.UUID(int=0)
RECEIPT_DAYS = 30  # a guest who logs in later than this has to draft again
MAX_TOPIC = 4000
MAX_CLAIM = 6
MAX_RECEIPT = 200_000  # characters; a real one is a few KB
DEV_KEY = "voxlace-development-only"  # local runs without a key; never in production
KEEP_DAYS = 3  # guest counters are deleted after this


@dataclass(frozen=True)
class GuestDraft:
    platform: str
    text: str
    length: int
    char_limit: int
    receipt: str


@dataclass(frozen=True)
class GuestFailure:
    platform: str
    code: str
    message: str


def _key() -> bytes:
    settings = get_settings()
    if settings.guest_signing_key:
        return settings.guest_signing_key.encode()
    if settings.app_env == "development":
        return DEV_KEY.encode()
    raise DraftError("guest_off", "Trying Voxlace without an account isn't available.", 503)


def visitor(address: str) -> str:
    """Who to count, without knowing who it is: a keyed hash of the IP address."""
    return hmac.new(_key(), address.encode(), hashlib.sha256).hexdigest()


def _sign(payload: dict) -> str:
    raw = json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode()
    body = base64.urlsafe_b64encode(raw)  # UTF-8: Amharic is 3 bytes a character, not 6
    mac = hmac.new(_key(), body, hashlib.sha256).hexdigest()
    return f"{body.decode()}.{mac}"


def read_receipt(receipt: str) -> dict:
    """The receipt's contents, or 400 when it was changed, is malformed or is too old."""
    if len(receipt or "") > MAX_RECEIPT:
        raise DraftError("invalid_receipt", "That draft can't be saved. Write it again.")
    body, _, mac = (receipt or "").partition(".")
    good = hmac.new(_key(), body.encode(), hashlib.sha256).hexdigest()
    # Bytes, not str: compare_digest refuses non-ASCII strings with a TypeError (a 500).
    if not mac or not hmac.compare_digest(mac.encode(), good.encode()):
        raise DraftError("invalid_receipt", "That draft can't be saved. Write it again.")
    payload = json.loads(base64.urlsafe_b64decode(body))
    if time.time() - payload["at"] > RECEIPT_DAYS * 86400:
        raise DraftError("invalid_receipt", "That draft is too old to save. Write it again.")
    return payload


def _spend(who: str, n: int) -> None:
    """Count `n` AI writing calls for this visitor today, or refuse before any AI call.
    The counter goes up before the call, so a failed call still counts: that stops a
    visitor from hammering a busy model."""
    settings = get_settings()
    today = datetime.now(UTC).date()
    with user_session(NOBODY) as s:
        s.execute(delete(GuestUsage).where(GuestUsage.day < today - timedelta(days=KEEP_DAYS)))
        mine = s.execute(
            text(
                "INSERT INTO guest_usage (day, visitor, drafts) VALUES (:d, :v, :n) "
                "ON CONFLICT (day, visitor) DO UPDATE SET drafts = guest_usage.drafts + :n "
                "RETURNING drafts"
            ),
            {"d": today, "v": who, "n": n},
        ).scalar_one()
        total = s.scalar(select(func.sum(GuestUsage.drafts)).where(GuestUsage.day == today))
        if mine > settings.guest_daily_drafts or total > settings.guest_daily_total:
            # Raising rolls the transaction back, so a refused request uses nothing.
            raise DraftError(
                "guest_limit",
                "You've used today's free guest drafts. Log in to keep going; your drafts "
                "here come with you.",
                429,
            )


def _rules(platform: str) -> PlatformProfile:
    with user_session(NOBODY) as s:
        rules = s.get(PlatformProfile, platform)
        if rules is None:
            raise DraftError("unknown_platform", f"Unknown platform: {platform}")
        s.expunge(rules)
    return rules


def _draft(platform: str, topic: str, ai: AIClient, who: str) -> GuestDraft:
    rules = _rules(platform)
    pool = inspiration(NOBODY, platform)
    prompt = build_prompt(rules, [], topic, pool=pool)
    result = ai.generate(prompt, purpose="guest_draft")
    out = clean_output(result.text)
    if not out:
        raise AIUnavailable("the model returned nothing")
    shapes = [Example(uuid.uuid4(), t, 0.0, False) for t in pool]  # never copy these
    if _problems(out, topic, shapes):
        # The fix-up is a second AI call, so it counts too; past the limit, keep the first.
        try:
            _spend(who, 1)
        except DraftError:
            return _guest_draft(rules, topic, out, prompt, result)
        prompt, result, out = _rewrite_if_needed(ai, prompt, result, out, topic, shapes)
    return _guest_draft(rules, topic, out, prompt, result)


def _guest_draft(rules, topic, out, prompt, result) -> GuestDraft:
    receipt = _sign(
        {
            "platform": rules.platform,
            "topic": topic,
            "text": out,
            "prompt": prompt,
            "model": result.model,
            "model_version": result.model_version,
            "provider": result.provider,
            "at": int(time.time()),
        }
    )
    length = post_length(out, rules.counting_rule)
    return GuestDraft(rules.platform, out, length, rules.char_limit, receipt)


def write(
    address: str, topic: str, platforms: list[str], ai: AIClient | None = None
) -> tuple[list[GuestDraft], list[GuestFailure]]:
    """One draft per platform from what the guest wrote. A platform that fails doesn't
    stop the others."""
    topic = (topic or "").strip()
    if not topic:
        raise DraftError("missing_topic", "Write what you did today first.")
    if len(topic) > MAX_TOPIC:
        raise DraftError("topic_too_long", f"Keep it under {MAX_TOPIC} characters.")
    platforms = list(dict.fromkeys(platforms))
    unknown = [p for p in platforms if p not in PLATFORM_NAMES]
    if not platforms or unknown:
        raise DraftError("unsupported_platform", "Pick X, LinkedIn or Telegram.")
    who = visitor(address)
    _spend(who, len(platforms))
    ai = ai or default_client()
    drafts, failures = [], []
    for platform in platforms:
        try:
            drafts.append(_draft(platform, topic, ai, who))
        except (AIUnavailable, EmbeddingUnavailable):
            failures.append(GuestFailure(platform, "ai_unavailable", AI_BUSY))
    return drafts, failures


def revise(
    address: str, receipt: str, instruction: str, ai: AIClient | None = None
) -> GuestDraft | str:
    """A chat instruction on a guest draft: a new draft and receipt, or the assistant's
    question (a string) when it needs a fact the guest didn't give (rule 10)."""
    if not instruction.strip():
        raise DraftError("missing_instruction", "Tell it what to change.")
    was = read_receipt(receipt)
    rules = _rules(was["platform"])
    _spend(visitor(address), 1)
    prompt = revise_prompt(
        rules, was["text"], instruction, was["topic"], "", "auto", "", selection=None
    )
    result = (ai or default_client()).generate(prompt, purpose="guest_revise")
    answer = clean_output(result.text)
    if not answer or answer.upper() == QUESTION:
        raise AIUnavailable("the model returned nothing")
    if answer.upper().startswith(QUESTION):
        return answer[len(QUESTION) :].strip()
    return _guest_draft(rules, was["topic"], answer, prompt, result)


def claim(user_id: uuid.UUID, receipts: list[str]) -> ThreadDetail:
    """After login: the guest's drafts become one chat in their account, each with the
    exact prompt and model that wrote it (rule 9). One transaction: all or nothing. Each
    prompt log keeps the time the prompt ran, so the daily limit (FR-30) counts a guest
    draft on the day it was written."""
    if not receipts or len(receipts) > MAX_CLAIM:
        raise DraftError("invalid_receipt", f"Save between 1 and {MAX_CLAIM} drafts at once.")
    drafts = [read_receipt(r) for r in receipts]  # all valid, or nothing is saved
    topic = drafts[0]["topic"]
    with user_session(user_id) as s:
        checkin = Checkin(user_id=user_id, day=local_today(s, user_id), text=topic)
        s.add(checkin)
        s.flush()
        thread = Thread(user_id=user_id, title=thread_title(topic), checkin_id=checkin.id)
        s.add(thread)
        s.flush()
        s.add(DraftMessage(user_id=user_id, thread_id=thread.id, role="user", text=topic))
        for d in drafts:
            draft = Draft(
                user_id=user_id,
                platform=d["platform"],
                topic=d["topic"],
                checkin_id=checkin.id,
                thread_id=thread.id,
            )
            s.add(draft)
            s.flush()
            version = DraftVersion(
                user_id=user_id, draft_id=draft.id, text=d["text"], model=d["model_version"]
            )
            s.add(version)
            s.flush()
            s.add(
                DraftMessage(
                    user_id=user_id,
                    thread_id=thread.id,
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
                    prompt=d["prompt"],
                    model=d["model"],
                    model_version=d["model_version"],
                    provider=d["provider"],
                    created_at=datetime.fromtimestamp(d["at"], UTC),
                )
            )
        thread_id = thread.id
    return detail(user_id, thread_id)
