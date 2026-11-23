"""Telegram bot (FR-36): status, the one-time link, disconnect, and the webhook Telegram calls
(checked by its secret header, no login). "Post to Telegram now" is POST /drafts/{id}/publish."""

import hmac
import json
import logging
import uuid

from fastapi import APIRouter, Depends, Request, Response
from fastapi.responses import JSONResponse

from app.core.auth import current_user
from app.core.config import get_settings
from app.core.errors import AppError, error_body
from app.schemas import TelegramChannelOut, TelegramLinkOut, TelegramOut
from app.services import telegram
from app.services.telegram_api import TelegramAPI

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/telegram", tags=["telegram"])
webhooks = APIRouter(tags=["telegram"])


def get_telegram() -> TelegramAPI:
    return TelegramAPI()


def require_enabled() -> None:
    if not get_settings().telegram_enabled:
        raise AppError("telegram_off", "The Telegram bot isn't set up on this server yet.", 404)


@router.get("", response_model=TelegramOut)
def get_telegram_status(user_id: uuid.UUID = Depends(current_user)) -> TelegramOut:
    cfg = get_settings()
    if not cfg.telegram_enabled:
        return TelegramOut(
            enabled=False,
            bot_username=None,
            linked=False,
            tg_username=None,
            channel=None,
            connect_url=None,
        )
    st = telegram.status(user_id)
    return TelegramOut(
        enabled=True,
        bot_username=cfg.telegram_bot_username,
        linked=st.linked,
        tg_username=st.tg_username,
        channel=TelegramChannelOut(
            title=st.channel.title, username=st.channel.username, can_post=st.channel.can_post
        )
        if st.channel
        else None,
        connect_url=telegram.connect_url(),
    )


@router.post("/link", response_model=TelegramLinkOut)
def start_link(user_id: uuid.UUID = Depends(current_user)) -> TelegramLinkOut:
    require_enabled()
    return TelegramLinkOut(url=telegram.new_link(user_id))


@router.delete("/channel", status_code=204)
def disconnect_channel(user_id: uuid.UUID = Depends(current_user)) -> Response:
    if not telegram.disconnect(user_id):
        raise AppError("not_connected", "No Telegram channel is connected.", 404)
    return Response(status_code=204)


@webhooks.post("/webhooks/telegram")
async def webhook(request: Request, api: TelegramAPI = Depends(get_telegram)) -> Response:
    """Updates from Telegram. Without the right secret header: refused. Anything else gets
    200, so Telegram doesn't resend an update we chose to ignore."""
    secret = get_settings().telegram_webhook_secret
    sent = request.headers.get("X-Telegram-Bot-Api-Secret-Token", "")
    if not secret or not hmac.compare_digest(sent.encode(), secret.encode()):
        return JSONResponse(error_body("bad_secret", "Not from Telegram."), 401)
    try:
        update = json.loads(await request.body())
    except ValueError:
        return JSONResponse({"ok": True})
    try:
        telegram.handle_update(update, api)
    except Exception:  # noqa: BLE001 - a bad update must not make Telegram retry forever
        logger.exception("telegram update failed")
    return JSONResponse({"ok": True})
