"""Encryption of users' AI keys (FR-48, NFR-19)."""

import pytest

from app.core import secrets
from app.core.config import get_settings


@pytest.fixture
def keys(monkeypatch):
    def use(value: str) -> None:
        monkeypatch.setattr(get_settings(), "ai_key_encryption_keys", value)

    return use


def test_sealed_text_reads_back_and_never_contains_the_key(keys):
    keys(secrets.new_key())
    sealed = secrets.seal("AIzaSy-very-secret-1234")
    assert "secret" not in sealed
    assert secrets.unseal(sealed) == "AIzaSy-very-secret-1234"


def test_rotation_new_key_first_still_reads_old_rows(keys):
    old, new = secrets.new_key(), secrets.new_key()
    keys(old)
    sealed = secrets.seal("the user's key")
    keys(f"{new},{old}")
    assert secrets.unseal(sealed) == "the user's key"
    keys(new)  # the old key removed: the row can't be read, and that is said, not guessed
    assert secrets.unseal(sealed) is None


def test_without_a_key_the_feature_is_off(keys):
    keys("")
    assert secrets.enabled() is False
    keys("not-a-fernet-key")
    assert secrets.enabled() is False
    keys(secrets.new_key())
    assert secrets.enabled() is True
