"""Your own AI keys (FR-48): saved encrypted, never shown again, private to you, and drafts
on them don't count towards the daily limit (FR-30). Plus the AI call log (NFR-20)."""

import uuid

import pytest
from sqlalchemy import select, text

from app.ai.client import CallRecord
from app.core import secrets
from app.core.config import get_settings
from app.core.db import user_session
from app.models import AICall, PromptLog, UserAIKey
from app.services import ai_calls, ai_keys, usage

KEY = "AIzaSyD-test-key-0000000000wxyz"


@pytest.fixture(autouse=True)
def encryption(monkeypatch):
    monkeypatch.setattr(get_settings(), "ai_key_encryption_keys", secrets.new_key())


def test_saving_checks_the_key_stores_it_sealed_and_shows_only_the_last_four(api, owner_engine):
    r = api.put("/api/v1/me/ai-keys/google", json={"key": f"  {KEY}  "})
    assert r.status_code == 200, r.text
    assert r.json()["last4"] == "wxyz" and r.json()["status"] == "active"
    assert KEY not in r.text
    assert api.state["ai"].checked == [("google", KEY)]
    with owner_engine.connect() as conn:
        sealed = conn.scalar(text("SELECT sealed_key FROM user_ai_keys"))
    assert KEY not in sealed and secrets.unseal(sealed) == KEY

    listed = api.get("/api/v1/me/ai-keys").json()
    assert listed["enabled"] is True
    assert {p["id"] for p in listed["providers"]} == {"google", "groq"}
    assert [k["provider"] for k in listed["keys"]] == ["google"]
    assert KEY not in str(listed)


def test_a_refused_key_is_not_saved(api):
    api.state["ai"].key_check = "reject"
    r = api.put("/api/v1/me/ai-keys/groq", json={"key": "gsk_" + "x" * 40})
    assert r.status_code == 400 and r.json()["error"]["code"] == "invalid_key"
    assert api.get("/api/v1/me/ai-keys").json()["keys"] == []


def test_when_the_provider_cant_be_reached_nothing_is_decided(api):
    api.state["ai"].key_check = "down"
    r = api.put("/api/v1/me/ai-keys/google", json={"key": KEY})
    assert r.status_code == 503 and r.json()["error"]["code"] == "key_check_unavailable"


@pytest.mark.parametrize("bad", ["short", "has a space in the middle of it ok", "x" * 301])
def test_obviously_wrong_keys_are_refused_before_asking_anyone(api, bad):
    r = api.put("/api/v1/me/ai-keys/google", json={"key": bad})
    assert r.status_code in (400, 422)
    assert api.state["ai"].checked == []


def test_unknown_provider_is_404(api):
    assert api.put("/api/v1/me/ai-keys/openai", json={"key": KEY}).status_code == 404


def test_feature_off_without_an_encryption_key(api, monkeypatch):
    monkeypatch.setattr(get_settings(), "ai_key_encryption_keys", "")
    assert api.get("/api/v1/me/ai-keys").json()["enabled"] is False
    r = api.put("/api/v1/me/ai-keys/google", json={"key": KEY})
    assert r.status_code == 503 and r.json()["error"]["code"] == "keys_disabled"


def test_replacing_and_removing_a_key(api):
    api.put("/api/v1/me/ai-keys/google", json={"key": KEY})
    api.put("/api/v1/me/ai-keys/google", json={"key": KEY[:-4] + "abcd"})
    keys = api.get("/api/v1/me/ai-keys").json()["keys"]
    assert [k["last4"] for k in keys] == ["abcd"]
    assert api.delete("/api/v1/me/ai-keys/google").status_code == 204
    assert api.delete("/api/v1/me/ai-keys/google").status_code == 404
    assert api.get("/api/v1/me/ai-keys").json()["keys"] == []


def test_another_user_never_sees_or_uses_your_key(api, make_user):
    me = api.state["user"]
    api.put("/api/v1/me/ai-keys/google", json={"key": KEY})
    other = make_user()
    api.state["user"] = other
    assert api.get("/api/v1/me/ai-keys").json()["keys"] == []
    assert ai_keys.active_keys(other) == {}
    assert api.delete("/api/v1/me/ai-keys/google").status_code == 404
    assert ai_keys.active_keys(me) == {"google": KEY}


def test_export_names_the_key_but_never_contains_it(api):
    api.put("/api/v1/me/ai-keys/google", json={"key": KEY})
    exported = api.get("/api/v1/me/export")
    assert exported.status_code == 200
    assert {"provider": "google", "last4": "wxyz", "status": "active"} in exported.json()["ai_keys"]
    assert KEY not in exported.text


def test_a_key_refused_later_is_marked_and_no_longer_used(api):
    user = api.state["user"]
    api.put("/api/v1/me/ai-keys/google", json={"key": KEY})
    ai_calls.record(
        CallRecord(
            user, "draft", "generate", True, "google", "m", None, "default", None, 2, 2, 900,
            rejected_keys=(("google", "401: API key expired"),),
        )
    )  # fmt: skip
    keys = api.get("/api/v1/me/ai-keys").json()["keys"]
    assert keys[0]["status"] == "rejected" and "expired" in keys[0]["last_error"]
    assert ai_keys.active_keys(user) == {}


# ---- the daily limit (FR-30) with your own key


def _logs(user_id, n, key_source):
    with user_session(user_id) as s:
        draft_id = s.scalar(
            text(
                "INSERT INTO drafts (user_id, platform, topic) VALUES (:u, 'x', 't') RETURNING id"
            ),
            {"u": user_id},
        )
        for _ in range(n):
            s.add(
                PromptLog(
                    user_id=user_id,
                    draft_id=draft_id,
                    prompt="p",
                    model="m",
                    provider="google",
                    key_source=key_source,
                )
            )


def test_drafts_on_your_own_key_dont_count(api, monkeypatch):
    user = api.state["user"]
    monkeypatch.setattr(get_settings(), "daily_draft_limit", 2)
    _logs(user, 5, "own")
    _logs(user, 1, "default")
    assert usage.usage(user).drafts == 1
    assert usage.check_drafts(user) is False


def test_past_the_limit_your_own_key_keeps_you_going(api, monkeypatch):
    user = api.state["user"]
    monkeypatch.setattr(get_settings(), "daily_draft_limit", 1)
    _logs(user, 1, "default")
    with pytest.raises(usage.LimitReached, match="own AI key"):
        usage.check_drafts(user)
    api.put("/api/v1/me/ai-keys/google", json={"key": KEY})
    assert usage.check_drafts(user) is True  # go on, on your key only
    assert api.get("/api/v1/me/usage").json()["own_key"] is True


# ---- the AI call log (NFR-20)


def test_calls_are_logged_privately_and_guest_calls_belong_to_nobody(api, make_user, owner_engine):
    me, other = api.state["user"], make_user()
    for who in (me, other, None):
        ai_calls.record(
            CallRecord(
                who, "draft", "generate", True, "google", "m", None, "default", None,
                1, 1, 1200, 700, 90, 40,
            )
        )  # fmt: skip
    with user_session(me) as s:
        mine = s.scalars(select(AICall)).all()
    assert [c.user_id for c in mine] == [me]  # RLS: not the other user's, not the guest's
    assert (mine[0].prompt_tokens, mine[0].thinking_tokens) == (700, 40)
    with owner_engine.connect() as conn:  # the team's report reads them all
        assert (
            conn.scalar(
                text("SELECT count(*) FROM ai_calls WHERE user_id IS NULL OR user_id IN (:a, :b)"),
                {"a": me, "b": other},
            )
            >= 3
        )


def test_deleting_the_account_removes_keys_and_call_log(api, owner_engine):
    user = api.state["user"]
    api.put("/api/v1/me/ai-keys/google", json={"key": KEY})
    ai_calls.record(
        CallRecord(user, "draft", "generate", True, "google", "m", None, "own", None, 1, 1, 10)
    )
    r = api.request("DELETE", "/api/v1/me", json={"confirm": "delete"})
    assert r.status_code in (200, 204), r.text
    with owner_engine.connect() as conn:
        for table in ("user_ai_keys", "ai_calls"):
            n = conn.scalar(text(f"SELECT count(*) FROM {table} WHERE user_id = :u"), {"u": user})
            assert n == 0, table


def test_key_rows_are_unreadable_without_the_owner(owner_engine):
    """No user set: the app role sees no keys at all (fails closed)."""
    with user_session(uuid.UUID(int=0)) as s:
        assert s.scalars(select(UserAIKey)).all() == []
