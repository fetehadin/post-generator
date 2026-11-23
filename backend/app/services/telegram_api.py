"""The Telegram Bot API calls Voxlace makes (FR-36), over httpx; tests pass a fake.

The token is part of the URL Telegram expects (api.telegram.org/bot<token>/method), so it is
never put into an error, a log line or a response: failures carry Telegram's own description
and error code only.
"""

import logging

import httpx

from app.core.config import Settings, get_settings

logger = logging.getLogger(__name__)
BASE = "https://api.telegram.org"


class TelegramError(Exception):
    """Telegram said no. `code` is its HTTP-like error_code (403: not an admin or blocked)."""

    def __init__(self, code: int, description: str) -> None:
        super().__init__(description)
        self.code = code
        self.description = description


class TelegramAPI:
    def __init__(self, settings: Settings | None = None, http: httpx.Client | None = None):
        self.settings = settings or get_settings()
        self.http = http or httpx.Client(timeout=20)

    def _call(self, method: str, payload: dict) -> dict:
        url = f"{BASE}/bot{self.settings.telegram_bot_token}/{method}"
        try:
            resp = self.http.post(url, json=payload)
        except httpx.TransportError as e:
            logger.warning("telegram %s: network error %s", method, type(e).__name__)
            raise TelegramError(0, "Telegram can't be reached") from None
        body = resp.json() if resp.content else {}
        if not body.get("ok"):
            code = int(body.get("error_code") or resp.status_code)
            logger.info("telegram %s refused: %s", method, code)
            raise TelegramError(code, str(body.get("description") or "refused"))
        return body.get("result") or {}

    def send_message(self, chat_id: int, text: str, buttons: list[tuple[str, str]] = ()) -> int:
        """Send plain text (no Markdown, so a post's * and _ stay as written). `buttons`:
        (label, url) pairs under the message. Returns the message id."""
        payload: dict = {"chat_id": chat_id, "text": text}
        if buttons:
            payload["reply_markup"] = {
                "inline_keyboard": [[{"text": t, "url": u}] for t, u in buttons]
            }
        return int(self._call("sendMessage", payload).get("message_id", 0))
