"""Encryption for secrets users give us: their own AI keys (FR-48, NFR-19).

Fernet is authenticated encryption (AES-128-CBC + HMAC-SHA256) from `cryptography`, which the
login library already installs. The server's keys live only in the environment
(`AI_KEY_ENCRYPTION_KEYS`), never in the database, so a database dump alone can't reveal a
user's key. Several comma-separated keys allow rotation: the first encrypts, all of them
decrypt, so a new key can go first while old rows are still readable.
"""

from functools import lru_cache

from cryptography.fernet import Fernet, InvalidToken, MultiFernet

from app.core.config import get_settings


class SecretsDisabled(Exception):
    """No encryption key is configured, so user keys can't be stored."""


@lru_cache
def _box(keys: str) -> MultiFernet:
    parts = [k.strip() for k in keys.split(",") if k.strip()]
    if not parts:
        raise SecretsDisabled("AI_KEY_ENCRYPTION_KEYS is not set")
    return MultiFernet([Fernet(k.encode()) for k in parts])


def enabled() -> bool:
    try:
        _box(get_settings().ai_key_encryption_keys)
    except (SecretsDisabled, ValueError):  # ValueError: a key that isn't valid Fernet
        return False
    return True


def seal(plain: str) -> str:
    return _box(get_settings().ai_key_encryption_keys).encrypt(plain.encode()).decode()


def unseal(token: str) -> str | None:
    """The plain text, or None when no configured key can read it (rotated away, tampered)."""
    try:
        return _box(get_settings().ai_key_encryption_keys).decrypt(token.encode()).decode()
    except (InvalidToken, SecretsDisabled, ValueError):
        return None


def new_key() -> str:
    """A fresh key for AI_KEY_ENCRYPTION_KEYS (`python -m app.dev new-secret-key`)."""
    return Fernet.generate_key().decode()
