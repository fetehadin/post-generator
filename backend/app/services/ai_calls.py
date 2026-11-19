"""Save every AI call (NFR-15, NFR-20): what it was for, who answered, on whose key, how long
it took and how many tokens it used. The weekly beta report and model decisions read this.
Never any prompt, post or key text.
"""

import logging
import uuid

from sqlalchemy import insert

from app.ai.client import CallRecord
from app.core.db import user_session
from app.models import AICall
from app.services import ai_keys

logger = logging.getLogger(__name__)

NOBODY = uuid.UUID(int=0)  # guests: a session that sees no user's rows


def record(r: CallRecord) -> None:
    # A plain INSERT without RETURNING: a guest's row (no user) is one nobody may read back.
    with user_session(r.user_id or NOBODY) as s:
        s.execute(
            insert(AICall).values(
                id=uuid.uuid4(),
                user_id=r.user_id,
                purpose=r.purpose[:32],
                kind=r.kind,
                ok=r.ok,
                provider=r.provider,
                model=(r.model or "")[:64] or None,
                model_version=(r.model_version or "")[:64] or None,
                key_source=r.key_source,
                error=r.error,
                attempts=min(r.attempts, 32767),
                routes_tried=min(r.routes_tried, 32767),
                latency_ms=r.latency_ms,
                prompt_tokens=r.prompt_tokens,
                output_tokens=r.output_tokens,
                thinking_tokens=r.thinking_tokens,
                items=r.items,
            )
        )
    if r.user_id is None:
        return
    for provider, why in r.rejected_keys:
        logger.info("a user's %s key was refused; marking it rejected", provider)
        ai_keys.mark_rejected(r.user_id, provider, why)
    if r.ok and r.key_source == "own" and r.provider:
        ai_keys.mark_used(r.user_id, r.provider)
