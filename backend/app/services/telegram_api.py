"""The Telegram Bot API calls Voxlace makes (FR-36), over httpx; tests pass a fake.

The token is part of the URL Telegram expects (api.telegram.org/bot<token>/method), so it is
never put into an error, a log line or a response: failures carry Telegram's own description
and error code only.
"""

import json
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

    def _call(self, method: str, payload: dict, files: dict | None = None) -> dict:
        url = f"{BASE}/bot{self.settings.telegram_bot_token}/{method}"
        try:
            if files:  # multipart: the pictures are uploaded, never linked (ADR 0002)
                form = {k: v if isinstance(v, str) else json.dumps(v) for k, v in payload.items()}
                resp = self.http.post(url, data=form, files=files, timeout=60)
            else:
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

    def send_photos(self, chat_id: int, caption: str, photos: list[tuple[bytes, str]]) -> int:
        """Post 1–10 pictures with the text as their caption, as ONE message (one call), so a
        post never goes out half sent (FR-58). `photos`: (bytes, content type) in order.
        Returns the first message id."""
        names = [f"p{i}" for i in range(len(photos))]
        files = {
            n: (f"{n}.{'png' if t == 'image/png' else 'jpg'}", data, t)
            for n, (data, t) in zip(names, photos, strict=True)
        }
        if len(photos) == 1:
            payload = {"chat_id": str(chat_id), "caption": caption, "photo": "attach://p0"}
            return int(self._call("sendPhoto", payload, files).get("message_id", 0))
        media = [{"type": "photo", "media": f"attach://{n}"} for n in names]
        if caption:
            media[0]["caption"] = caption
        result = self._call("sendMediaGroup", {"chat_id": str(chat_id), "media": media}, files)
        first = result[0] if isinstance(result, list) and result else {}
        return int(first.get("message_id", 0))
