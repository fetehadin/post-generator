"""The chat board (FR-40, FR-46): start a thread from what you did today, list past threads,
read one, and generate a draft card per platform into it. Revising a card is
POST /drafts/{id}/revise; another platform's version is POST /drafts/{id}/convert."""

import uuid

from fastapi import APIRouter, Depends

from app.ai.client import AIClient
from app.api.deps import get_ai
from app.api.shapes import thread_out
from app.core.auth import current_user
from app.core.errors import AppError
from app.schemas import ThreadGenerateIn, ThreadIn, ThreadOut, ThreadRowOut, ThreadsOut
from app.services import threads
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


@router.get("", response_model=ThreadsOut)
def list_threads(user_id: uuid.UUID = Depends(current_user)) -> ThreadsOut:
    return ThreadsOut(
        items=[
            ThreadRowOut(
                id=r.thread.id,
                title=r.thread.title,
                platforms=r.platforms,
                updated_at=r.thread.updated_at,
            )
            for r in threads.list_threads(user_id)
        ]
    )


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
    try:
        detail, failures = threads.generate(user_id, thread_id, body.platforms, ai=ai)
    except DraftError as e:
        raise _fail(e) from e
    return thread_out(detail, failures)
