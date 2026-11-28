"""Pictures on a draft (FR-58, ADR 0002): add, open, reorder and remove. Only the owner can
open a picture; there is no public address."""

import uuid

from fastapi import APIRouter, Depends, File, Response, UploadFile
from fastapi.responses import FileResponse

from app.api.drafts import _detail, _fail
from app.api.uploads import _require_privacy
from app.core.auth import current_user
from app.schemas import DraftDetailOut, PicturesOrderIn
from app.services import library, pictures
from app.services.drafting import DraftError

router = APIRouter(prefix="/drafts", tags=["pictures"])


@router.post("/{draft_id}/pictures", response_model=DraftDetailOut, status_code=201)
def add_picture(
    draft_id: uuid.UUID,
    file: UploadFile = File(...),
    user_id: uuid.UUID = Depends(current_user),
) -> DraftDetailOut:
    _require_privacy(user_id)  # FR-37: no upload before the privacy notice
    data = file.file.read(pictures.MAX_BYTES + 1)
    try:
        pictures.add(user_id, draft_id, data)
        return _detail(library.detail(user_id, draft_id))
    except DraftError as e:
        raise _fail(e) from e


@router.get("/{draft_id}/pictures/{picture_id}")
def read_picture(
    draft_id: uuid.UUID, picture_id: uuid.UUID, user_id: uuid.UUID = Depends(current_user)
) -> FileResponse:
    try:
        p = pictures.get(user_id, draft_id, picture_id)
    except DraftError as e:
        raise _fail(e) from e
    return FileResponse(
        pictures.path_of(p),
        media_type=p.content_type,
        headers={"Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff"},
    )


@router.put("/{draft_id}/pictures/order", response_model=DraftDetailOut)
def order_pictures(
    draft_id: uuid.UUID, body: PicturesOrderIn, user_id: uuid.UUID = Depends(current_user)
) -> DraftDetailOut:
    try:
        pictures.reorder(user_id, draft_id, body.ids)
        return _detail(library.detail(user_id, draft_id))
    except DraftError as e:
        raise _fail(e) from e


@router.delete("/{draft_id}/pictures/{picture_id}", status_code=204)
def remove_picture(
    draft_id: uuid.UUID, picture_id: uuid.UUID, user_id: uuid.UUID = Depends(current_user)
) -> Response:
    try:
        pictures.remove(user_id, draft_id, picture_id)
    except DraftError as e:
        raise _fail(e) from e
    return Response(status_code=204)
