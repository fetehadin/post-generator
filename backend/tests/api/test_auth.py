"""Login, invites, the privacy notice and two-user isolation, with real token checks.

Tokens are signed here with a test secret, the way Supabase signs them (HS256, audience
"authenticated", `sub` = user id). Nothing calls Supabase.
"""

import json
import secrets
import time
import uuid
from pathlib import Path

import jwt
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.api.deps import get_ai
from app.core.config import get_settings
from app.main import create_app
from tests.api.test_api import FakeAI

# Made fresh each run: nothing secret-like lives in the code (and the secret scan stays quiet).
SECRET = secrets.token_urlsafe(32)
SAMPLES = Path(__file__).resolve().parents[3] / "samples"


def token(sub: uuid.UUID, email: str, *, secret=SECRET, aud="authenticated", exp_in=3600):
    claims = {"sub": str(sub), "email": email, "aud": aud, "exp": int(time.time()) + exp_in}
    return jwt.encode(claims, secret, algorithm="HS256")


@pytest.fixture
def login(monkeypatch, owner_engine):
    """Login configured with a test secret; yields a factory for clients acting as new people."""
    monkeypatch.setenv("SUPABASE_JWT_SECRET", SECRET)
    monkeypatch.setenv("SUPABASE_URL", "")
    monkeypatch.setenv("ALLOWED_EMAILS", "team@voxlace.test")
    get_settings.cache_clear()
    app = create_app()
    app.dependency_overrides[get_ai] = lambda: FakeAI()
    people: list[uuid.UUID] = []

    def person(email: str | None = None):
        uid = uuid.uuid4()
        people.append(uid)
        client = TestClient(app, raise_server_exceptions=False)
        client.headers["Authorization"] = f"Bearer {token(uid, email or f'{uid}@x.test')}"
        client.uid = uid
        return client

    yield person
    get_settings.cache_clear()
    with owner_engine.begin() as conn:
        conn.execute(text("DELETE FROM invites WHERE code LIKE 'TEST-%'"))
        conn.execute(text("DELETE FROM users WHERE id = ANY(:ids)"), {"ids": people})


def invite(owner_engine, email=None) -> str:
    code = f"TEST-{uuid.uuid4().hex[:8].upper()}"
    with owner_engine.begin() as conn:
        conn.execute(
            text("INSERT INTO invites (code, email) VALUES (:c, :e)"), {"c": code, "e": email}
        )
    return code


def upload(client, data: bytes):
    return client.post(
        "/api/v1/imports", data={"platform": "telegram"}, files={"file": ("result.json", data)}
    )


# ---- tokens (FR-27)


def test_no_token_is_401(login):
    client = login()
    del client.headers["Authorization"]
    r = client.get("/api/v1/posts")
    assert r.status_code == 401 and r.json()["error"]["code"] == "not_logged_in"


@pytest.mark.parametrize(
    "bad",
    [
        {"exp_in": -10},  # expired
        {"secret": secrets.token_urlsafe(32)},  # forged: signed with another key
        {"aud": "anon"},  # not a logged-in user
    ],
)
def test_bad_tokens_are_401(login, bad):
    client = login()
    client.headers["Authorization"] = f"Bearer {token(client.uid, 'a@x.test', **bad)}"
    assert client.get("/api/v1/me").status_code == 401


def test_health_needs_no_login(login):
    client = login()
    del client.headers["Authorization"]
    assert client.get("/api/v1/health").status_code == 200


# ---- invites (FR-28) and the privacy notice (FR-37)


def test_a_new_person_needs_an_invite(login):
    client = login()
    assert client.get("/api/v1/me").json()["admitted"] is False
    r = client.get("/api/v1/posts")
    assert r.status_code == 403 and r.json()["error"]["code"] == "invite_required"


def test_an_invite_admits_once_then_uploads_wait_for_the_privacy_notice(login, owner_engine):
    code = invite(owner_engine)
    client = login()
    me = client.post("/api/v1/me/invite", json={"code": code.lower()}).json()
    assert me["admitted"] is True and me["privacy_accepted"] is False

    data = (SAMPLES / "telegram" / "result.json").read_bytes()
    r = upload(client, data)
    assert r.status_code == 403 and r.json()["error"]["code"] == "privacy_required"

    assert client.post("/api/v1/me/privacy-accept").json()["privacy_accepted"] is True
    assert upload(client, data).status_code == 201

    other = login()
    r = other.post("/api/v1/me/invite", json={"code": code})
    assert r.status_code == 400 and r.json()["error"]["code"] == "invalid_invite"


def test_an_invite_for_one_email_refuses_others(login, owner_engine):
    code = invite(owner_engine, email="sam@x.test")
    assert login("eve@x.test").post("/api/v1/me/invite", json={"code": code}).status_code == 400
    assert login("sam@x.test").post("/api/v1/me/invite", json={"code": code}).status_code == 200


def test_allow_listed_emails_need_no_code(login):
    client = login("team@voxlace.test")
    assert client.get("/api/v1/me").json()["admitted"] is True
    assert client.get("/api/v1/posts").status_code == 200


# ---- dev user only locally with no login configured


def test_dev_user_needs_development_and_no_login(monkeypatch):
    monkeypatch.setenv("SUPABASE_JWT_SECRET", "")
    monkeypatch.setenv("SUPABASE_URL", "")
    for env, expected in (("development", True), ("production", False)):
        monkeypatch.setenv("APP_ENV", env)
        get_settings.cache_clear()
        assert get_settings().dev_user_without_login is expected
    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.setenv("SUPABASE_JWT_SECRET", SECRET)
    get_settings.cache_clear()
    assert get_settings().dev_user_without_login is False
    get_settings.cache_clear()


# ---- Phase 2 demo: two accounts, neither reaches the other's data (FR-29)


def test_two_users_never_see_each_others_posts_imports_or_prompts(login, owner_engine):
    a, b = login(), login()
    for client in (a, b):
        client.post("/api/v1/me/invite", json={"code": invite(owner_engine)})
        client.post("/api/v1/me/privacy-accept")

    sample = json.loads((SAMPLES / "telegram" / "result.json").read_text("utf-8"))
    for m in sample["messages"]:  # B's posts are marked so a leak would show
        if isinstance(m.get("text"), str) and m["text"]:
            m["text"] = "BETA-ONLY " + m["text"]
    imp_a = upload(a, (SAMPLES / "telegram" / "result.json").read_bytes()).json()
    upload(b, json.dumps(sample).encode())

    a_posts = a.get("/api/v1/posts").json()["items"]
    b_posts = b.get("/api/v1/posts").json()["items"]
    assert a_posts and b_posts
    assert not {p["id"] for p in a_posts} & {p["id"] for p in b_posts}
    assert all("BETA-ONLY" not in p["text"] for p in a_posts)

    assert b.get(f"/api/v1/imports/{imp_a['id']}").status_code == 404

    draft = a.post("/api/v1/drafts/generate", json={"platform": "telegram", "topic": "ship log"})
    assert draft.status_code == 201
    prompt = a.get(f"/api/v1/drafts/{draft.json()['id']}/prompt").json()["prompt"]
    assert "BETA-ONLY" not in prompt  # only A's posts reached A's prompt
    assert b.get(f"/api/v1/drafts/{draft.json()['id']}/prompt").status_code == 404


# ---- cloud Supabase signs with ES256 keys published at the project URL


@pytest.fixture
def cloud(monkeypatch):
    """Login configured like a cloud project: a URL with published keys, no shared secret."""
    from cryptography.hazmat.primitives.asymmetric import ec

    from app.core import auth

    private = ec.generate_private_key(ec.SECP256R1())
    monkeypatch.setenv("SUPABASE_URL", "https://proj.supabase.co")
    monkeypatch.setenv("SUPABASE_JWT_SECRET", "")
    get_settings.cache_clear()

    class FakeJwks:  # stands in for https://proj.supabase.co/auth/v1/.well-known/jwks.json
        def get_signing_key_from_jwt(self, _token):
            return type("Key", (), {"key": private.public_key()})()

    monkeypatch.setattr(auth, "_jwks_client", lambda _url: FakeJwks())
    yield private
    get_settings.cache_clear()


def es256(private, sub, iss="https://proj.supabase.co/auth/v1"):
    claims = {"sub": str(sub), "email": "c@x.test", "aud": "authenticated", "iss": iss,
              "exp": int(time.time()) + 600}  # fmt: skip
    return jwt.encode(claims, private, algorithm="ES256")


def test_cloud_es256_tokens_are_accepted(cloud):
    from app.core.auth import verify_token

    uid = uuid.uuid4()
    assert verify_token(es256(cloud, uid)).user_id == uid


@pytest.mark.parametrize("case", ["wrong_issuer", "hs256_without_secret", "unsigned"])
def test_cloud_rejects_wrong_issuer_unconfigured_hs256_and_unsigned(cloud, case):
    from app.core.auth import verify_token
    from app.core.errors import AppError

    uid = uuid.uuid4()
    bad = {
        "wrong_issuer": lambda: es256(cloud, uid, iss="https://evil.example/auth/v1"),
        "hs256_without_secret": lambda: token(uid, "c@x.test"),
        "unsigned": lambda: jwt.encode({"sub": str(uid), "aud": "authenticated",
                                        "exp": int(time.time()) + 600}, None, algorithm="none"),
    }[case]()  # fmt: skip
    with pytest.raises(AppError) as err:
        verify_token(bad)
    assert err.value.status == 401
