"""Users' own AI keys (FR-48): bring a Gemini or Groq key and your drafts use your quota.

- A key is checked with the provider before it's saved, without spending generation quota.
- It's stored encrypted (core/secrets.py); the plain key is never logged, exported or sent
  back. The app shows only the last four characters.
- Drafts try the user's keys first and fall back to the app's keys (ai/client.py). Drafts
  written on the user's key don't count towards the daily limit (FR-30).
- A key the provider later refuses is marked "rejected" and skipped until it's replaced.
"""

import logging
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import select, update

from app.ai.client import KeyCheckUnavailable, KeyRejected
from app.core import secrets
from app.core.db import user_session
from app.models import UserAIKey

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class Provider:
    id: str
    name: str
    key_url: str  # where to make a key
    used_for: str


PROVIDERS = {
    "google": Provider(
        "google",
        "Google Gemini",
        "https://aistudio.google.com/apikey",
        "Drafts, revisions and reading your imported posts",
    ),
    "groq": Provider("groq", "Groq", "https://console.groq.com/keys", "Drafts and revisions"),
}


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
                select(UserAIKey).where(UserAIKey.user_id == user_id).order_by(UserAIKey.provider)
            )
        )


def save(user_id: uuid.UUID, provider: str, key: str, check) -> UserAIKey:
    """Check the key with the provider (`check(provider, key)`), then store it encrypted.
    Replaces any key the user had for that provider."""
    if provider not in PROVIDERS:
        raise AIKeyError("unknown_provider", "Pick Google Gemini or Groq.", 404)
    if not enabled():
        raise AIKeyError(
            "keys_disabled", "Adding your own AI key isn't switched on for this app yet.", 503
        )
    key = key.strip()
    if not 20 <= len(key) <= 300 or any(c.isspace() for c in key):
        raise AIKeyError(
            "invalid_key", "That doesn't look like an API key. Copy the whole key again.", 400
        )
    name = PROVIDERS[provider].name
    try:
        check(provider, key)
    except KeyRejected as e:
        logger.info("a user's %s key was refused at saving", provider)
        raise AIKeyError(
            "invalid_key",
            f"{name} didn't accept this key. Check that it's copied in full and still active.",
            400,
        ) from e
    except KeyCheckUnavailable as e:
        raise AIKeyError(
            "key_check_unavailable",
            f"We couldn't reach {name} to check the key. Try again in a minute.",
            503,
        ) from e
    with user_session(user_id) as s:
        row = s.get(UserAIKey, (user_id, provider))
        if row is None:
            row = UserAIKey(user_id=user_id, provider=provider)
            s.add(row)
        row.sealed_key = secrets.seal(key)
        row.last4 = key[-4:]
        row.status = "active"
        row.last_error = None
        row.last_used_at = None
        s.flush()
        s.refresh(row)
        return row


def delete(user_id: uuid.UUID, provider: str) -> bool:
    with user_session(user_id) as s:
        row = s.get(UserAIKey, (user_id, provider))
        if row is None:
            return False
        s.delete(row)
        return True


def active_keys(user_id: uuid.UUID) -> dict[str, str]:
    """The user's working keys, decrypted, for the AI client. A key no configured encryption
    key can read (after a rotation went wrong) is left out, never guessed."""
    with user_session(user_id) as s:
        rows = s.execute(
            select(UserAIKey.provider, UserAIKey.sealed_key).where(
                UserAIKey.user_id == user_id, UserAIKey.status == "active"
            )
        ).all()
    keys = {}
    for provider, sealed in rows:
        plain = secrets.unseal(sealed)
        if plain:
            keys[provider] = plain
    return keys


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
