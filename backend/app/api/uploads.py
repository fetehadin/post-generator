"""Resume and portfolio text for the summary card (FR-20, FR-21, NFR-11, NFR-12).

The file or page is read in memory, turned into text, cleaned of contact details and only
then saved. Nothing reaches the AI until the user marks the text reviewed.
"""

import uuid

from fastapi import APIRouter, Depends, File, Response, UploadFile

from app.core.auth import current_user
from app.core.db import user_session
from app.core.errors import AppError
from app.models import Upload, User
from app.schemas import PortfolioIn, UploadOut, UploadPatchIn, UploadsOut
from app.services import uploads as service
from app.services.uploads import UploadError

router = APIRouter(prefix="/uploads", tags=["uploads"])


def _out(u: Upload) -> UploadOut:
    return UploadOut(
        id=u.id,
        kind=u.kind,
        source=u.source,
        text=u.cleaned_text,
        removed=u.removed or {},
        reviewed=u.reviewed_at is not None,
        created_at=u.created_at,
        updated_at=u.updated_at,
    )


def _fail(e: UploadError) -> AppError:
    return AppError(e.code, e.message, e.status)


def _require_privacy(user_id: uuid.UUID) -> None:
    with user_session(user_id) as s:
        if s.get(User, user_id).privacy_accepted_at is None:  # FR-37
            raise AppError(
                "privacy_required", "Read and accept the privacy notice before uploading.", 403
            )


@router.post("/resume", response_model=UploadOut, status_code=201)
def upload_resume(
    file: UploadFile = File(...), user_id: uuid.UUID = Depends(current_user)
) -> UploadOut:
    _require_privacy(user_id)
    data = file.file.read(service.MAX_FILE_BYTES + 1)
    try:
        text = service.resume_text(data)
        return _out(service.save(user_id, "resume", file.filename or "resume", text))
    except UploadError as e:
        raise _fail(e) from e


@router.post("/portfolio", response_model=UploadOut, status_code=201)
def upload_portfolio(body: PortfolioIn, user_id: uuid.UUID = Depends(current_user)) -> UploadOut:
    _require_privacy(user_id)
    try:
        text = service.fetch_page(body.url)
        return _out(service.save(user_id, "portfolio", body.url.strip(), text))
    except UploadError as e:
        raise _fail(e) from e


@router.get("", response_model=UploadsOut)
def list_uploads(user_id: uuid.UUID = Depends(current_user)) -> UploadsOut:
    return UploadsOut(items=[_out(u) for u in service.list_uploads(user_id)])


@router.patch("/{upload_id}", response_model=UploadOut)
def edit_upload(
    upload_id: uuid.UUID, body: UploadPatchIn, user_id: uuid.UUID = Depends(current_user)
) -> UploadOut:
    try:
        return _out(service.update(user_id, upload_id, body.text, body.reviewed))
    except UploadError as e:
        raise _fail(e) from e


@router.delete("/{upload_id}", status_code=204)
def delete_upload(upload_id: uuid.UUID, user_id: uuid.UUID = Depends(current_user)) -> Response:
    try:
        service.delete(user_id, upload_id)
    except UploadError as e:
        raise _fail(e) from e
    return Response(status_code=204)
