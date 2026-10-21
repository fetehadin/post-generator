"""The logged-in user: who they are, joining with an invite (FR-28), the privacy notice (FR-37)."""

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Response
from fastapi.responses import JSONResponse
from sqlalchemy import select

from app.core.auth import Identity, admit_if_allowed, create_user, current_user, identity
from app.core.db import user_session
from app.core.errors import AppError
from app.models import Invite, User
from app.schemas import DeleteMeIn, InviteIn, MeOut, UsageOut
from app.services import account, usage

router = APIRouter(prefix="/me", tags=["me"])


def _me(who: Identity) -> MeOut:
    admitted = admit_if_allowed(who)
    accepted = False
    if admitted:
        with user_session(who.user_id) as s:
            accepted = s.get(User, who.user_id).privacy_accepted_at is not None
    return MeOut(id=who.user_id, email=who.email, admitted=admitted, privacy_accepted=accepted)


@router.get("", response_model=MeOut)
def get_me(who: Identity = Depends(identity)) -> MeOut:
    return _me(who)


@router.post("/invite", response_model=MeOut)
def redeem_invite(body: InviteIn, who: Identity = Depends(identity)) -> MeOut:
    code = body.code.strip().upper()
    with user_session(who.user_id) as s:
        invite = s.scalars(
            select(Invite).where(Invite.code == code, Invite.used_by.is_(None)).with_for_update()
        ).first()
        if invite is None or (invite.email and invite.email.lower() != who.email):
            raise AppError("invalid_invite", "That invite code isn't valid or has been used.")
        create_user(s, who)
        invite.used_by, invite.used_at = who.user_id, datetime.now(UTC)
    return _me(who)


@router.post("/privacy-accept", response_model=MeOut)
def accept_privacy(user_id=Depends(current_user), who: Identity = Depends(identity)) -> MeOut:
    with user_session(user_id) as s:
        user = s.get(User, user_id)
        if user.privacy_accepted_at is None:
            user.privacy_accepted_at = datetime.now(UTC)
    return _me(who)


@router.get("/usage", response_model=UsageOut)
def get_usage(user_id=Depends(current_user)) -> UsageOut:
    """FR-30: today's counts against the daily limits."""
    u = usage.usage(user_id)
    return UsageOut(
        drafts=u.drafts,
        draft_limit=u.draft_limit,
        posts=u.posts,
        post_limit=u.post_limit,
        resets_at=u.resets_at,
    )


@router.get("/export")
def export_data(user_id=Depends(current_user)) -> JSONResponse:
    """FR-38: everything the user gave Voxlace or made with it, as one JSON file."""
    day = datetime.now(UTC).date().isoformat()
    return JSONResponse(
        account.export_all(user_id),
        headers={"Content-Disposition": f'attachment; filename="voxlace-export-{day}.json"'},
    )


@router.delete("", status_code=204)
def delete_me(body: DeleteMeIn, user_id=Depends(current_user)) -> Response:
    """FR-38, NFR-10: delete every row the user owns. The body must say "delete"."""
    if body.confirm.strip().lower() != "delete":
        raise AppError("confirm_required", 'Type "delete" to confirm.')
    account.delete_all(user_id)
    return Response(status_code=204)
