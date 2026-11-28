"""Pictures on a draft (FR-58, ADR 0002).

A picture belongs to one draft. Each upload is checked from its bytes (JPEG, PNG or WebP),
re-encoded without its hidden data (a phone photo's GPS location, camera details) and saved in
the picture folder as `<user_id>/<file_name>`; the row in `draft_pictures` says which draft it
belongs to and in what order. The AI never sees a picture.

Rows are deleted with their draft's lifecycle (Posted, discarded, deleted: see library._move
and the foreign keys); `prune()` then deletes every file of the user that has no row, so a
crash between the two only leaves a file until the next prune.
"""

import io
import logging
import os
import shutil
import time
import uuid
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageOps, UnidentifiedImageError
from sqlalchemy import delete, func, select

from app.core.config import get_settings
from app.core.db import user_session
from app.models import Draft, DraftPicture
from app.services.drafting import DraftError

logger = logging.getLogger(__name__)

MAX_BYTES = 10 * 1024 * 1024  # per picture, before and after re-encoding (Telegram's photo cap)
MAX_PER_DRAFT = 4  # X takes 4; Telegram albums and LinkedIn take more
MAX_SIDE = 4096  # longer pictures are scaled down; Telegram shows at most 2560 anyway
MAX_PIXELS = 50_000_000  # refuse "decompression bombs" before decoding them
KINDS = {"JPEG", "PNG", "WEBP"}
FRESH_SECONDS = 60  # prune() leaves files this new alone (an upload may be committing)
EDITABLE = ("draft", "approved")  # once Posted or discarded, the pictures are gone


@dataclass(frozen=True)
class Encoded:
    data: bytes
    content_type: str
    ext: str
    width: int
    height: int


def folder(user_id: uuid.UUID) -> Path:
    return Path(get_settings().pictures_dir) / str(user_id)


def path_of(p: DraftPicture) -> Path:
    return folder(p.user_id) / p.file_name


def encode(data: bytes) -> Encoded:
    """Check and re-encode an upload. Only the pixels survive: no EXIF, GPS or comments.
    Raises DraftError with a plain reason."""
    if len(data) > MAX_BYTES:
        raise DraftError("too_big", "Pictures can be at most 10 MB.", 413)
    try:
        with Image.open(io.BytesIO(data)) as probe:
            kind = probe.format
            w, h = probe.size
        if kind not in KINDS:
            raise DraftError("not_a_picture", "Add a JPEG, PNG or WebP picture.", 415)
        if w * h > MAX_PIXELS:
            raise DraftError("too_big", "That picture is too large. Try a smaller one.", 413)
        with Image.open(io.BytesIO(data)) as img:
            img.load()
            img = ImageOps.exif_transpose(img)  # keep a phone photo upright without its EXIF
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError):
        raise DraftError("not_a_picture", "Add a JPEG, PNG or WebP picture.", 415) from None

    img.thumbnail((MAX_SIDE, MAX_SIDE))
    clear = img.mode in ("RGBA", "LA", "PA") or (img.mode == "P" and "transparency" in img.info)
    out = io.BytesIO()
    if kind == "PNG" or clear:  # screenshots stay sharp, see-through stays see-through
        img = img.convert("RGBA" if clear else "RGB")
        img.save(out, "PNG", optimize=True)
        content_type, ext = "image/png", "png"
    else:
        img.convert("RGB").save(out, "JPEG", quality=90, optimize=True)
        content_type, ext = "image/jpeg", "jpg"
    if out.tell() > MAX_BYTES:
        raise DraftError("too_big", "That picture is too large. Try a smaller one.", 413)
    return Encoded(out.getvalue(), content_type, ext, img.width, img.height)


def _editable_draft(s, draft_id: uuid.UUID) -> Draft:
    d = s.get(Draft, draft_id, with_for_update=True)
    if d is None:  # RLS hides other users' drafts too (FR-29)
        raise DraftError("not_found", "Not found.", 404)
    if d.status not in EDITABLE:
        raise DraftError("not_editable", "This post is already posted or discarded.", 409)
    return d


def add(user_id: uuid.UUID, draft_id: uuid.UUID, data: bytes) -> None:
    """Add one picture at the end of the draft's pictures."""
    with user_session(user_id) as s:
        _editable_draft(s, draft_id)  # 404 before saying anything about the file
        count = s.scalar(
            select(func.count()).select_from(DraftPicture).where(DraftPicture.draft_id == draft_id)
        )
        if count >= MAX_PER_DRAFT:
            raise DraftError("too_many_pictures", "A post can have at most 4 pictures.", 409)
        pic = encode(data)
        picture_id = uuid.uuid4()
        name = f"{picture_id.hex}.{pic.ext}"
        s.add(
            DraftPicture(
                id=picture_id,
                user_id=user_id,
                draft_id=draft_id,
                position=count,
                file_name=name,
                content_type=pic.content_type,
                bytes=len(pic.data),
                width=pic.width,
                height=pic.height,
            )
        )
        s.flush()
        target = folder(user_id) / name
        target.parent.mkdir(parents=True, exist_ok=True)
        tmp = target.with_suffix(".part")
        tmp.write_bytes(pic.data)
        os.replace(tmp, target)  # whole file or nothing
    logger.info("pictures: added one to a draft")


def get(user_id: uuid.UUID, draft_id: uuid.UUID, picture_id: uuid.UUID) -> DraftPicture:
    """The picture's row, if it's this user's and its file is there."""
    with user_session(user_id) as s:
        p = s.get(DraftPicture, picture_id)
        if p is None or p.draft_id != draft_id or not path_of(p).is_file():
            raise DraftError("not_found", "Not found.", 404)
        s.expunge(p)
    return p


def of_drafts(s, draft_ids: list[uuid.UUID]) -> dict[uuid.UUID, list[DraftPicture]]:
    """Each draft's pictures in posting order, inside the caller's session."""
    out: dict[uuid.UUID, list[DraftPicture]] = {}
    if not draft_ids:
        return out
    for p in s.scalars(
        select(DraftPicture)
        .where(DraftPicture.draft_id.in_(draft_ids))
        .order_by(DraftPicture.draft_id, DraftPicture.position)
    ):
        out.setdefault(p.draft_id, []).append(p)
    return out


def reorder(user_id: uuid.UUID, draft_id: uuid.UUID, ids: list[uuid.UUID]) -> None:
    with user_session(user_id) as s:
        _editable_draft(s, draft_id)
        pics = of_drafts(s, [draft_id]).get(draft_id, [])
        if len(ids) != len(set(ids)) or set(ids) != {p.id for p in pics}:
            raise DraftError("wrong_pictures", "Send each of this draft's pictures once.")
        by_id = {p.id: p for p in pics}
        for i, picture_id in enumerate(ids):
            by_id[picture_id].position = i


def remove(user_id: uuid.UUID, draft_id: uuid.UUID, picture_id: uuid.UUID) -> None:
    with user_session(user_id) as s:
        _editable_draft(s, draft_id)
        p = s.get(DraftPicture, picture_id)
        if p is None or p.draft_id != draft_id:
            raise DraftError("not_found", "Not found.", 404)
        s.delete(p)
        s.flush()
        for i, rest in enumerate(of_drafts(s, [draft_id]).get(draft_id, [])):
            rest.position = i
    prune(user_id)


def drop_rows(s, draft_id: uuid.UUID) -> None:
    """The draft is Posted or discarded: its picture rows go in the caller's transaction.
    Call prune() after the commit to delete the files."""
    s.execute(delete(DraftPicture).where(DraftPicture.draft_id == draft_id))


def prune(user_id: uuid.UUID) -> int:
    """Delete the user's files that no row points to (posted, discarded or deleted drafts, or
    an upload that never committed). Returns how many were deleted."""
    where = folder(user_id)
    if not where.is_dir():
        return 0
    with user_session(user_id) as s:
        keep = set(s.scalars(select(DraftPicture.file_name).where(DraftPicture.user_id == user_id)))
    gone = 0
    fresh = time.time() - FRESH_SECONDS
    for f in where.iterdir():
        # A file this new may belong to an upload whose row isn't committed yet.
        if f.name not in keep and f.stat().st_mtime < fresh:
            f.unlink(missing_ok=True)
            gone += 1
    return gone


def delete_all(user_id: uuid.UUID) -> None:
    """The account is deleted (FR-38): every picture file goes with it."""
    shutil.rmtree(folder(user_id), ignore_errors=True)
