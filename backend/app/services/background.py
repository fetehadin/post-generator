"""The API's one background job (NFR-14): every few minutes, embed posts that are still
waiting, for example after the embedding model was busy during an import. It runs inside the
API process, so V1 needs no separate worker service. Nothing here posts anywhere.
"""

import logging
import threading

from app.services.embedding import embed_in_background, users_waiting

logger = logging.getLogger(__name__)


def retry_once() -> int:
    """One pass over every user with waiting posts. Returns how many users it tried."""
    users = users_waiting()
    for user_id in users:
        try:
            embed_in_background(user_id)
        except Exception:  # one user's failure must not stop the others or the loop
            logger.exception("embedding retry failed for a user")
    return len(users)


def start_retry_loop(interval_seconds: int) -> threading.Event:
    """Run `retry_once` every `interval_seconds` on a daemon thread. Set the returned event
    to stop it (the app does this on shutdown)."""
    stop = threading.Event()

    def loop() -> None:
        while not stop.wait(interval_seconds):
            try:
                retry_once()
            except Exception:  # the database may be restarting; try again next time
                logger.exception("embedding retry pass failed")

    threading.Thread(target=loop, name="embedding-retry", daemon=True).start()
    return stop
