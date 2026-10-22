"""Drafts: generate (FR-7, FR-8), the library (FR-11), the editor with chat revisions and
versions (FR-10, FR-40), approve, schedule and "Posted" (FR-12, FR-13), and the exact prompt
behind a draft (NFR-15)."""

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, Response

from app.ai.client import AIClient, AIUnavailable, EmbeddingUnavailable
from app.api.deps import get_ai
from app.api.shapes import row_out, thread_out
from app.core.auth import current_user
from app.core.errors import AppError
from app.schemas import (
    ConvertIn,
    DraftDetailOut,
    DraftOut,
    DraftPatchIn,
    DraftsOut,
    DraftStatsOut,
    DraftStatus,
    GenerateIn,
    LengthOut,
    MessageOut,
    Platform,
    PromptOut,
    ReviseIn,
    ThreadOut,
    VersionOut,
)
from app.services import library, threads
from app.services.drafting import DraftError, generate_draft, prompt_for
from app.services.revising import revise

router = APIRouter(prefix="/drafts", tags=["drafts"])

AI_BUSY = "The AI service is busy right now. Try again in a minute."


def _detail(r: library.DraftDetail) -> DraftDetailOut:
    return DraftDetailOut(
        **row_out(r).model_dump(),
        topic=r.draft.topic,
        checkin_id=r.draft.checkin_id,
        versions=[
            VersionOut(
                id=v.id, number=i, text=v.text, instruction=v.instruction, created_at=v.created_at
            )
            for i, v in enumerate(r.versions, 1)
        ],
        messages=[
            MessageOut(
                id=m.id,
                role=m.role,
                text=m.text,
                version_id=m.draft_version_id,
                created_at=m.created_at,
            )
            for m in r.messages
        ],
    )


def _fail(e: DraftError) -> AppError:
    return AppError(e.code, e.message, e.status)


@router.post("/generate", response_model=DraftOut, status_code=201)
def generate(
    body: GenerateIn,
    user_id: uuid.UUID = Depends(current_user),
    ai: AIClient = Depends(get_ai),
) -> DraftOut:
    try:
        r = generate_draft(user_id, body.platform, body.topic, ai=ai, checkin_id=body.checkin_id)
    except DraftError as e:
        raise _fail(e) from e
    except (AIUnavailable, EmbeddingUnavailable) as e:
        # The user's topic is in their own request; nothing is lost (NFR-4).
        raise AppError("ai_unavailable", AI_BUSY, 503) from e
    return DraftOut(
        id=r.draft_id,
        platform=body.platform,
        status="draft",
        text=r.text,
        length=LengthOut(count=r.length, limit=r.char_limit, over=r.over_limit),
        model=r.model_version or r.model,
        examples_used=len(r.examples),
        created_at=r.created_at,
        thread_id=r.thread_id,
    )


@router.get("", response_model=DraftsOut)
def list_drafts(
    status: DraftStatus | None = None,
    platform: Platform | None = None,
    scheduled_from: datetime | None = None,
    scheduled_to: datetime | None = None,
    created_from: datetime | None = None,
    user_id: uuid.UUID = Depends(current_user),
) -> DraftsOut:
    rows = library.list_drafts(
        user_id, status, platform, scheduled_from, scheduled_to, created_from
    )
    return DraftsOut(items=[row_out(r) for r in rows])


@router.get("/stats", response_model=DraftStatsOut)
def draft_stats(user_id: uuid.UUID = Depends(current_user)) -> DraftStatsOut:
    st = library.stats(user_id)
    return DraftStatsOut(
        created=st.created,
        published=st.published,
        publish_rate=st.publish_rate,
        edited=st.edited,
    )


@router.get("/{draft_id}", response_model=DraftDetailOut)
def read_draft(draft_id: uuid.UUID, user_id: uuid.UUID = Depends(current_user)) -> DraftDetailOut:
    try:
        return _detail(library.detail(user_id, draft_id))
    except DraftError as e:
        raise _fail(e) from e


@router.patch("/{draft_id}", response_model=DraftDetailOut)
def edit_draft(
    draft_id: uuid.UUID, body: DraftPatchIn, user_id: uuid.UUID = Depends(current_user)
) -> DraftDetailOut:
    try:
        return _detail(library.update(user_id, draft_id, body.model_dump(exclude_unset=True)))
    except DraftError as e:
        raise _fail(e) from e


@router.post("/{draft_id}/revise", response_model=DraftDetailOut)
def revise_draft(
    draft_id: uuid.UUID,
    body: ReviseIn,
    user_id: uuid.UUID = Depends(current_user),
    ai: AIClient = Depends(get_ai),
) -> DraftDetailOut:
    try:
        return _detail(revise(user_id, draft_id, body.instruction, body.selection, ai=ai))
    except DraftError as e:
        raise _fail(e) from e
    except AIUnavailable as e:
        raise AppError("ai_unavailable", AI_BUSY, 503) from e


@router.post("/{draft_id}/convert", response_model=ThreadOut, status_code=201)
def convert_draft(
    draft_id: uuid.UUID,
    body: ConvertIn,
    user_id: uuid.UUID = Depends(current_user),
    ai: AIClient = Depends(get_ai),
) -> ThreadOut:
    """FR-40: the same post for another platform, as a new card in the draft's thread."""
    try:
        return thread_out(threads.convert(user_id, draft_id, body.platform, ai=ai))
    except DraftError as e:
        raise _fail(e) from e
    except (AIUnavailable, EmbeddingUnavailable) as e:
        raise AppError("ai_unavailable", AI_BUSY, 503) from e


@router.delete("/{draft_id}", status_code=204)
def delete_draft(draft_id: uuid.UUID, user_id: uuid.UUID = Depends(current_user)) -> Response:
    """Delete a discarded draft for good (Drafts → Discarded → Delete forever)."""
    try:
        library.delete_forever(user_id, draft_id)
    except DraftError as e:
        raise _fail(e) from e
    return Response(status_code=204)


@router.post("/{draft_id}/versions/{version_id}/restore", response_model=DraftDetailOut)
def restore_version(
    draft_id: uuid.UUID, version_id: uuid.UUID, user_id: uuid.UUID = Depends(current_user)
) -> DraftDetailOut:
    try:
        return _detail(library.restore(user_id, draft_id, version_id))
    except DraftError as e:
        raise _fail(e) from e


@router.get("/{draft_id}/prompt", response_model=PromptOut)
def get_prompt(draft_id: uuid.UUID, user_id: uuid.UUID = Depends(current_user)) -> PromptOut:
    log = prompt_for(user_id, draft_id)
    if log is None:
        raise AppError("not_found", "Not found.", 404)
    return PromptOut(
        prompt=log.prompt, model=log.model, model_version=log.model_version, provider=log.provider
    )
