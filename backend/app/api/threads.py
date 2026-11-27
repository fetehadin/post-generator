"""The chat board (FR-40, FR-46): start a thread from what you did today, list past threads,
read one, and generate a draft card per platform into it. Rename, pin, archive, delete or
retitle a chat (FR-55). Revising a card is
POST /drafts/{id}/revise; another platform's version is POST /drafts/{id}/convert."""

import uuid

from fastapi import APIRouter, Depends

from app.ai.client import AIClient
from app.api.deps import get_ai
from app.api.shapes import thread_out
from app.core.auth import current_user
from app.core.errors import AppError
from app.schemas import (
    ClaimIn,
    ThreadDeletedOut,
    ThreadGenerateIn,
    ThreadIn,
    ThreadOut,
    ThreadPatchIn,
    ThreadRowOut,
    ThreadsOut,
)
from app.services import guest, threads
from app.services.drafting import DraftError

router = APIRouter(prefix="/threads", tags=["threads"])


def _fail(e: DraftError) -> AppError:
    return AppError(e.code, e.message, e.status)


@router.post("", response_model=ThreadOut, status_code=201)
def start_thread(body: ThreadIn, user_id: uuid.UUID = Depends(current_user)) -> ThreadOut:
    """ "Save": the text becomes that day's check-in and the first message of a new thread."""
    try:
        return thread_out(threads.start(user_id, body.text, body.day))
    except DraftError as e:
        raise _fail(e) from e


@router.post("/claim", response_model=ThreadOut, status_code=201)
def claim(body: ClaimIn, user_id: uuid.UUID = Depends(current_user)) -> ThreadOut:
    """FR-47: after login, the drafts written as a guest become one chat in this account."""
    try:
        return thread_out(guest.claim(user_id, body.receipts))
    except DraftError as e:
        raise _fail(e) from e


def _row(thread, platforms: list[str]) -> ThreadRowOut:
    return ThreadRowOut(
        id=thread.id,
        title=thread.title,
        platforms=platforms,
        updated_at=thread.updated_at,
        pinned=thread.pinned,
        archived=thread.archived_at is not None,
    )


@router.get("", response_model=ThreadsOut)
def list_threads(user_id: uuid.UUID = Depends(current_user)) -> ThreadsOut:
    """Pinned first, then last touched first; archived chats are included and flagged."""
    return ThreadsOut(items=[_row(r.thread, r.platforms) for r in threads.list_threads(user_id)])


@router.patch("/{thread_id}", response_model=ThreadRowOut)
def patch_thread(
    thread_id: uuid.UUID, body: ThreadPatchIn, user_id: uuid.UUID = Depends(current_user)
) -> ThreadRowOut:
    """FR-55: rename, pin or archive."""
    try:
        thread = threads.update(
            user_id, thread_id, title=body.title, pinned=body.pinned, archived=body.archived
        )
    except DraftError as e:
        raise _fail(e) from e
    return _row(thread, threads.platforms_of(user_id, thread_id))


@router.post("/{thread_id}/title", response_model=ThreadRowOut)
def regenerate_title(
    thread_id: uuid.UUID,
    user_id: uuid.UUID = Depends(current_user),
    ai: AIClient = Depends(get_ai),
) -> ThreadRowOut:
    """FR-55: a short title written by the AI from the chat's check-in."""
    try:
        thread = threads.regenerate_title(user_id, thread_id, ai)
    except DraftError as e:
        raise _fail(e) from e
    return _row(thread, threads.platforms_of(user_id, thread_id))


@router.delete("/{thread_id}", response_model=ThreadDeletedOut)
def delete_thread(
    thread_id: uuid.UUID, user_id: uuid.UUID = Depends(current_user)
) -> ThreadDeletedOut:
    """FR-55: the chat and its unapproved drafts go; approved, scheduled and posted drafts stay."""
    try:
        return ThreadDeletedOut(kept_drafts=threads.delete_thread(user_id, thread_id))
    except DraftError as e:
        raise _fail(e) from e


@router.get("/{thread_id}", response_model=ThreadOut)
def read_thread(thread_id: uuid.UUID, user_id: uuid.UUID = Depends(current_user)) -> ThreadOut:
    try:
        return thread_out(threads.detail(user_id, thread_id))
    except DraftError as e:
        raise _fail(e) from e


@router.post("/{thread_id}/generate", response_model=ThreadOut, status_code=201)
def generate(
    thread_id: uuid.UUID,
    body: ThreadGenerateIn,
    user_id: uuid.UUID = Depends(current_user),
    ai: AIClient = Depends(get_ai),
) -> ThreadOut:
    """One draft card per platform. A platform that can't be written comes back in
    `failures`; the others still arrive."""
    notices: list[threads.Failure] = []
    try:
        detail, failures = threads.generate(
            user_id, thread_id, body.platforms, ai=ai, hook_type=body.hook_type, notices=notices
        )
    except DraftError as e:
        raise _fail(e) from e
    return thread_out(detail, failures, notices)
