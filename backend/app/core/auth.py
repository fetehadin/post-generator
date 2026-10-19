"""Who is calling (FR-27, FR-28).

Supabase signs a token when the user logs in; the frontend sends it as
`Authorization: Bearer <token>`. We only verify it: signature, expiry, audience
("authenticated") and, with a Supabase URL, the issuer. The user id is the token's `sub`.

Two dependencies:
- `identity`: a valid token (or the dev user locally). Used by /me, which admits new users.
- `current_user`: a valid token *and* an admitted user (invite redeemed or email allowed).
  Every other route depends on it, and every query is per-user under RLS.
"""

import uuid
from dataclasses import dataclass
from functools import lru_cache

import jwt
from fastapi import Header
from sqlalchemy import func
from sqlalchemy.dialects.postgresql import insert

from app.core.config import get_settings
from app.core.db import user_session
from app.core.errors import AppError
from app.models import Profile, User

DEV_USER_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")
DEV_EMAIL = "dev@voxlace.local"
_dev_user_ready = False


@dataclass(frozen=True)
class Identity:
    user_id: uuid.UUID
    email: str


def ensure_dev_user() -> None:
    global _dev_user_ready
    if _dev_user_ready:
        return
    with user_session(DEV_USER_ID) as s:
        stmt = insert(User).values(
            id=DEV_USER_ID, email=DEV_EMAIL, name="Dev user", privacy_accepted_at=func.now()
        )
        s.execute(  # the developer has read the notice; keep an older acceptance date
            stmt.on_conflict_do_update(
                index_elements=[User.id],
                set_={"privacy_accepted_at": func.coalesce(User.privacy_accepted_at, func.now())},
            )
        )
    _dev_user_ready = True


@lru_cache
def _jwks_client(url: str) -> jwt.PyJWKClient:
    return jwt.PyJWKClient(f"{url.rstrip('/')}/auth/v1/.well-known/jwks.json", cache_keys=True)


def verify_token(token: str) -> Identity:
    settings = get_settings()
    options = {"require": ["exp", "sub"]}
    try:
        if settings.supabase_jwt_secret:
            claims = jwt.decode(
                token, settings.supabase_jwt_secret, algorithms=["HS256"],
                audience="authenticated", options=options,
            )  # fmt: skip
        else:
            key = _jwks_client(settings.supabase_url).get_signing_key_from_jwt(token)
            claims = jwt.decode(
                token, key.key, algorithms=["ES256", "RS256"], audience="authenticated",
                issuer=f"{settings.supabase_url.rstrip('/')}/auth/v1", options=options,
            )  # fmt: skip
        return Identity(uuid.UUID(claims["sub"]), str(claims.get("email", "")).lower())
    except (jwt.PyJWTError, ValueError) as e:
        raise AppError("not_logged_in", "Your session has ended. Log in again.", 401) from e


def identity(authorization: str | None = Header(default=None)) -> Identity:
    settings = get_settings()
    if not authorization and settings.dev_user_without_login:
        ensure_dev_user()
        return Identity(DEV_USER_ID, DEV_EMAIL)
    scheme, _, token = (authorization or "").partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise AppError("not_logged_in", "Log in to continue.", 401)
    return verify_token(token)


def create_user(s, who: Identity) -> None:
    """The user row and their empty profile (Phase 3 fills it in)."""
    s.execute(insert(User).values(id=who.user_id, email=who.email).on_conflict_do_nothing())
    s.flush()
    s.execute(insert(Profile).values(user_id=who.user_id).on_conflict_do_nothing())


def admit_if_allowed(who: Identity) -> bool:
    """Create the user row when their email is on the allow-list (FR-28). True if admitted."""
    with user_session(who.user_id) as s:
        if s.get(User, who.user_id):
            return True
        if who.email and who.email in get_settings().allowed_email_set:
            create_user(s, who)
            return True
    return False


def current_user(authorization: str | None = Header(default=None)) -> uuid.UUID:
    who = identity(authorization)
    if not admit_if_allowed(who):
        raise AppError("invite_required", "Enter your invite code to start using Voxlace.", 403)
    return who.user_id
