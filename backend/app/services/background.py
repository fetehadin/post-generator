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


def start_github_loop(interval_seconds: int = 3600) -> threading.Event:
    """FR-14: once an hour, users at their evening hour get their GitHub digest. Nothing is
    posted; suggestions wait in the app for the user."""
    from app.services import github

    stop = threading.Event()

    def loop() -> None:
        while not stop.wait(interval_seconds):
            try:
                github.run_once()
            except Exception:  # the database or GitHub may be down; try again next hour
                logger.exception("github pass failed")

    threading.Thread(target=loop, name="github-digests", daemon=True).start()
    return stop


def start_telegram_loop(interval_seconds: int = 60) -> threading.Event:
    """ADR 0001: every minute, the bot posts approved Telegram drafts whose time has come. Each
    draft is locked while it is sent, so two API processes never post the same one."""
    from app.services import telegram
    from app.services.telegram_api import TelegramAPI

    stop = threading.Event()

    def loop() -> None:
        api = TelegramAPI()
        while not stop.wait(interval_seconds):
            try:
                telegram.send_due(api)
            except Exception:  # the database or Telegram may be down; try again next minute
                logger.exception("telegram send pass failed")

    threading.Thread(target=loop, name="telegram-sender", daemon=True).start()
    return stop
