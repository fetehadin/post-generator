"""Response builders shared by several routers: a draft row and a whole thread."""

from app.schemas import (
    CardOut,
    DraftRowOut,
    GenerateFailureOut,
    LengthOut,
    ThreadMessageOut,
    ThreadOut,
)
from app.services import library
from app.services.threads import Failure, ThreadDetail


def length_out(length: library.Length) -> LengthOut:
    return LengthOut(count=length.count, limit=length.limit, over=length.over)


def row_out(r: library.DraftRow) -> DraftRowOut:
    d = r.draft
    return DraftRowOut(
        id=d.id,
        platform=d.platform,
        status=d.status,
        text=r.text,
        length=length_out(r.length),
        scheduled_for=d.scheduled_for,
        published_at=d.published_at,
        created_at=d.created_at,
        updated_at=r.updated_at,
        thread_id=d.thread_id,
    )


def thread_out(t: ThreadDetail, failures: list[Failure] = ()) -> ThreadOut:
    return ThreadOut(
        id=t.thread.id,
        title=t.thread.title,
        checkin_id=t.thread.checkin_id,
        checkin_text=t.checkin_text,
        created_at=t.thread.created_at,
        updated_at=t.thread.updated_at,
        messages=[
            ThreadMessageOut(
                id=m.id,
                role=m.role,
                text=m.text,
                draft_id=m.draft_id,
                card=CardOut(
                    version_id=c.version_id,
                    number=c.number,
                    text=c.text,
                    length=length_out(c.length),
                )
                if c
                else None,
                created_at=m.created_at,
            )
            for m, c in t.messages
        ],
        drafts=[row_out(r) for r in t.drafts],
        failures=[
            GenerateFailureOut(platform=f.platform, code=f.code, message=f.message)
            for f in failures
        ],
    )
