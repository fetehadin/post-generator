"""Users' own AI keys (FR-48): bring a Gemini or Groq key and your drafts use your quota.

- A key is checked with the provider before it's saved, without spending generation quota
  (a models-list call; app/ai/providers.py has each provider's details).
- Refusals come back as invalid_key, quota_exceeded, region_or_age_blocked or network_error,
  each with a plain fix that names a free provider to try instead. Never the provider's
  raw reply, and never the key.
- It's stored encrypted (core/secrets.py); the plain key is never logged, exported or sent
  back. The app shows only the last four characters.
- Drafts try the user's keys first and fall back to the app's keys (ai/client.py). Drafts
  written on the user's key don't count towards the daily limit (FR-30).
- A key the provider later refuses is marked "rejected" and skipped until it's replaced.
"""

import logging
import re
import uuid
from datetime import UTC, datetime

from sqlalchemy import select, update

from app.ai.client import KeyCheckUnavailable, KeyRejected
from app.ai.providers import PROVIDERS, ProviderInfo, detect
from app.core import secrets
from app.core.db import user_session
from app.models import UserAIKey

logger = logging.getLogger(__name__)


MODEL_CHARS = re.compile(r"^[A-Za-z0-9._:/@-]{1,128}$")


class AIKeyError(Exception):
    def __init__(self, code: str, message: str, status: int) -> None:
        super().__init__(message)
        self.code, self.message, self.status = code, message, status


def enabled() -> bool:
    return secrets.enabled()


def list_keys(user_id: uuid.UUID) -> list[UserAIKey]:
    with user_session(user_id) as s:
        return list(
            s.scalars(
                select(UserAIKey)
                .where(UserAIKey.user_id == user_id)
                .order_by(UserAIKey.created_at.desc())
            )
        )


def save(user_id: uuid.UUID, provider: str, key: str, check, model: str | None = None) -> UserAIKey:
    """Check the key with one tiny call (`check(provider, key, model)`), then store it
    encrypted. Replaces any key the user had for that provider. `model` empty = the
    provider's default (settings.byok_default_models)."""
    if provider not in PROVIDERS:
        raise AIKeyError("unknown_provider", "Pick one of the listed providers.", 404)
    model = (model or "").strip() or None
    if model and not MODEL_CHARS.match(model):
        raise AIKeyError("invalid_model", "That model name has characters models never use.", 400)
    if not enabled():
        raise AIKeyError(
            "keys_disabled", "Adding your own AI key isn't switched on for this app yet.", 503
        )
    key = key.strip()
    if not 20 <= len(key) <= 300 or any(c.isspace() for c in key):
        raise AIKeyError(
            "invalid_key", "That doesn't look like an API key. Copy the whole key again.", 400
        )
    info = PROVIDERS[provider]
    looks_like = detect(key)
    if (looks_like and looks_like != provider) or (info.pattern and not info.matches(key)):
        raise AIKeyError("invalid_key", refusal_message("invalid_key", info, looks_like), 400)
    try:
        check(provider, key, model)
    except KeyRejected as e:
        logger.info("a user's %s key was refused at saving (%s)", provider, e.reason)
        raise AIKeyError(e.reason, refusal_message(e.reason, info), 400) from e
    except KeyCheckUnavailable as e:
        raise AIKeyError("network_error", refusal_message("network_error", info), 503) from e
    with user_session(user_id) as s:
        row = s.get(UserAIKey, (user_id, provider))
        if row is None:
            row = UserAIKey(user_id=user_id, provider=provider)
            s.add(row)
        row.sealed_key = secrets.seal(key)
        row.created_at = datetime.now(UTC)  # "added": a replaced key counts as new
        row.last4 = key[-4:]
        row.prefix = key[:3] if len(key) >= 24 else ""  # "sk-…a9F2"; short keys show less
        row.model = model
        row.status = "active"
        row.last_error = None
        row.last_used_at = None
        s.flush()
        s.refresh(row)
        return row


def other_free(info: ProviderInfo) -> ProviderInfo | None:
    """The free provider to suggest when this one doesn't work out."""
    return next((p for p in PROVIDERS.values() if p.free and p.id != info.id), None)


def refusal_message(reason: str, info: ProviderInfo, looks_like: str | None = None) -> str:
    """A plain-language fix for a refused key, ending with the next thing to try."""
    other = other_free(info)
    instead = f" Try {other.name} instead." if other else ""
    if reason == "invalid_key" and looks_like and looks_like != info.id:
        return f"That looks like a {PROVIDERS[looks_like].name} key, not a {info.name} key."
    if reason == "invalid_key":
        starts = f" (it starts with {info.hint})" if info.hint else ""
        return f"That doesn't look right. Make sure you copied the whole key{starts}."
    if reason == "region_or_age_blocked":
        if info.id == "google":
            return (
                "Google says AI Studio isn't available for this account (it needs to be 18+ "
                f"and age-verified).{instead}"
            )
        return f"{info.name} isn't available for this account or country.{instead}"
    if reason == "quota_exceeded":
        return "This key is out of free quota. Try again later or use another provider."
    return f"We couldn't reach {info.name} to check the key. Try again in a minute."


def delete(user_id: uuid.UUID, provider: str) -> bool:
    with user_session(user_id) as s:
        row = s.get(UserAIKey, (user_id, provider))
        if row is None:
            return False
        s.delete(row)
        return True


def active_keys(user_id: uuid.UUID) -> dict[str, tuple[str, str | None]]:
    """The user's working keys, decrypted, with their chosen models, newest first: the AI
    client tries them in this order, before Voxlace's own. A key no configured encryption
    key can read (after a rotation went wrong) is left out, never guessed."""
    with user_session(user_id) as s:
        rows = s.execute(
            select(UserAIKey.provider, UserAIKey.sealed_key, UserAIKey.model)
            .where(UserAIKey.user_id == user_id, UserAIKey.status == "active")
            .order_by(UserAIKey.created_at.desc())
        ).all()
    keys = {}
    for provider, sealed, model in rows:
        plain = secrets.unseal(sealed)
        if plain:
            keys[provider] = (plain, model)
    return keys


def masked(row: UserAIKey) -> str:
    return f"{row.prefix}…{row.last4}" if row.prefix else f"…{row.last4}"


def has_active_key(user_id: uuid.UUID) -> bool:
    """A key the AI client can really use: active and readable with today's encryption keys."""
    return bool(active_keys(user_id))


def mark_rejected(user_id: uuid.UUID, provider: str, why: str) -> None:
    with user_session(user_id) as s:
        s.execute(
            update(UserAIKey)
            .where(UserAIKey.user_id == user_id, UserAIKey.provider == provider)
            .values(status="rejected", last_error=why[:300])
        )


def mark_used(user_id: uuid.UUID, provider: str) -> None:
    with user_session(user_id) as s:
        s.execute(
            update(UserAIKey)
            .where(UserAIKey.user_id == user_id, UserAIKey.provider == provider)
            .values(last_used_at=datetime.now(UTC))
        )
