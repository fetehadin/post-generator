"""Daily check-ins: save, list, edit and delete (FR-6)."""

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Response

from app.core.auth import current_user
from app.core.errors import AppError
from app.models import Checkin
from app.schemas import CheckinIn, CheckinOut, CheckinPatchIn, CheckinsOut
from app.services import checkins as service

router = APIRouter(prefix="/checkins", tags=["checkins"])


def _out(c: Checkin) -> CheckinOut:
    return CheckinOut(
        id=c.id, day=c.day, text=c.text, created_at=c.created_at, updated_at=c.updated_at
    )


@router.post("", response_model=CheckinOut, status_code=201)
def create(body: CheckinIn, user_id: uuid.UUID = Depends(current_user)) -> CheckinOut:
    day = body.day or datetime.now(UTC).date()
    return _out(service.create(user_id, body.text.strip(), day))


@router.get("", response_model=CheckinsOut)
def list_checkins(user_id: uuid.UUID = Depends(current_user)) -> CheckinsOut:
    return CheckinsOut(items=[_out(c) for c in service.list_recent(user_id)])


@router.patch("/{checkin_id}", response_model=CheckinOut)
def edit(
    checkin_id: uuid.UUID, body: CheckinPatchIn, user_id: uuid.UUID = Depends(current_user)
) -> CheckinOut:
    changes = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    if "text" in changes:
        changes["text"] = changes["text"].strip()
    row = service.update(user_id, checkin_id, changes)
    if row is None:
        raise AppError("not_found", "Not found.", 404)
    return _out(row)


@router.delete("/{checkin_id}", status_code=204)
def delete(checkin_id: uuid.UUID, user_id: uuid.UUID = Depends(current_user)) -> Response:
    if not service.delete(user_id, checkin_id):
        raise AppError("not_found", "Not found.", 404)
    return Response(status_code=204)
