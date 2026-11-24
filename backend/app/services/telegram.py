"""Telegram bot (FR-36): link a Voxlace account, connect a channel, post approved drafts.

1. Profile → Connections → "Connect Telegram" makes a one-time token (15 minutes, stored as a
   SHA-256) and opens t.me/<bot>?start=<token>. The bot gets "/start <token>" with the user's
   Telegram id and pairs the two accounts.
2. The bot answers with a button that opens Telegram's channel picker with the admin rights
   already ticked. When the user confirms, Telegram sends a `my_chat_member` update; the
   channel is connected to whoever added the bot, matched by their Telegram id.
3. An approved draft goes out at its planned time through the background sender, or at once
   with "Post now" (ADR 0001: approving with a time is the user's consent).

The webhook has no logged-in user: it finds one through three id-only database functions,
then works as that user under RLS. Never logs tokens or post text.
"""

import hashlib
import logging
import secrets
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, select, text

from app.core.config import get_settings
from app.core.db import get_engine, user_session
from app.models import Draft, TelegramAccount, TelegramChannel, TelegramLinkToken
from app.services import library
from app.services.drafting import DraftError
from app.services.telegram_api import TelegramAPI, TelegramError

logger = logging.getLogger(__name__)

RIGHTS = "post_messages+edit_messages+delete_messages"
HELP = (
    "I post your approved Voxlace drafts to your Telegram channel, only when you tap "
    "“Post to Telegram now” in Voxlace.\n\n"
    "1. In Voxlace: Profile → Connections → Connect Telegram.\n"
    "2. Tap the button I send to add me to your channel as an admin.\n\n"
    "Didn't work? Add me as an admin of your channel by hand, with “Post messages” on."
)


@dataclass(frozen=True)
class ChannelInfo:
    title: str
    username: str | None
    can_post: bool


@dataclass(frozen=True)
class TelegramStatus:
    linked: bool
    tg_username: str | None
    channel: ChannelInfo | None


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def bot_url() -> str:
    return f"https://t.me/{get_settings().telegram_bot_username}"


def connect_url() -> str:
    """Telegram's channel picker with the bot's admin rights already ticked."""
    return f"{bot_url()}?startchannel&admin={RIGHTS}"


def _lookup(function: str, value: int | str) -> uuid.UUID | None:
    # Only these three, each returning a user id and never a row (migration 0018).
    assert function in {
        "user_for_telegram_token",
        "user_for_telegram_user",
        "user_for_telegram_chat",
    }
    with get_engine().connect() as conn:
        return conn.scalar(text(f"SELECT {function}(:v)"), {"v": value})


def status(user_id: uuid.UUID) -> TelegramStatus:
    with user_session(user_id) as s:
        account = s.get(TelegramAccount, user_id)
        channel = s.get(TelegramChannel, user_id)
        return TelegramStatus(
            linked=account is not None,
            tg_username=account.tg_username if account else None,
            channel=ChannelInfo(channel.title, channel.username, channel.can_post)
            if channel
            else None,
        )


def new_link(user_id: uuid.UUID) -> str:
    """A fresh one-time link to the bot. Older unused tokens of this user stop working."""
    token = secrets.token_urlsafe(24)  # 32 characters of [A-Za-z0-9_-], what /start allows
    minutes = get_settings().telegram_link_minutes
    with user_session(user_id) as s:
        s.execute(delete(TelegramLinkToken).where(TelegramLinkToken.user_id == user_id))
        s.add(
            TelegramLinkToken(
                token_hash=_hash(token),
                user_id=user_id,
                expires_at=datetime.now(UTC) + timedelta(minutes=minutes),
            )
        )
    return f"{bot_url()}?start={token}"


def disconnect(user_id: uuid.UUID) -> bool:
    """Forget the channel. The bot stays an admin there until the user removes it."""
    with user_session(user_id) as s:
        channel = s.get(TelegramChannel, user_id)
        if channel is None:
            return False
        s.delete(channel)
    return True


# ---- the webhook -------------------------------------------------------------------------


def _say(api: TelegramAPI, chat_id: int, message: str, buttons: list[tuple[str, str]] = ()) -> None:
    try:
        api.send_message(chat_id, message, buttons)
    except TelegramError:
        pass  # the user blocked the bot, or Telegram is down: nothing else to do


def handle_update(update: dict, api: TelegramAPI) -> None:
    """One update from Telegram. Never raises for something a user did; Telegram would retry."""
    if message := update.get("message"):
        _on_message(message, api)
    elif change := update.get("my_chat_member"):
        _on_member_change(change, api)


def _on_message(message: dict, api: TelegramAPI) -> None:
    chat = message.get("chat") or {}
    sender = message.get("from") or {}
    if chat.get("type") != "private" or not sender.get("id"):
        return
    words = (message.get("text") or "").split()
    command = words[0].split("@")[0].lower() if words else ""
    tg_id = int(sender["id"])

    if command == "/start" and len(words) > 1:
        _link(words[1], tg_id, sender.get("username"), api)
    elif command in ("/start", "/connect"):
        if _lookup("user_for_telegram_user", tg_id):
            _say(
                api,
                tg_id,
                "Add me to your channel as an admin:",
                [("Add me to a channel", connect_url())],
            )
        else:
            _say(
                api,
                tg_id,
                "First link your Voxlace account: in Voxlace, open Profile → Connections and "
                "tap Connect Telegram.",
            )
    else:
        _say(api, tg_id, HELP)


def _link(token: str, tg_id: int, tg_username: str | None, api: TelegramAPI) -> None:
    user_id = _lookup("user_for_telegram_token", _hash(token))
    if user_id is None:
        _say(
            api,
            tg_id,
            "That link has expired or was already used. In Voxlace, open Profile → Connections "
            "and tap Connect Telegram again.",
        )
        return
    # The sender holds this Telegram account and the signed-in Voxlace account that made the
    # token, so a link (and its channel) on another Voxlace account of theirs moves here.
    moved: dict | None = None
    owner = _lookup("user_for_telegram_user", tg_id)
    if owner is not None and owner != user_id:
        with user_session(owner) as s:
            old = s.get(TelegramChannel, owner)
            if old is not None:
                moved = {
                    "chat_id": old.chat_id,
                    "title": old.title,
                    "username": old.username,
                    "can_post": old.can_post,
                }
                s.delete(old)
            s.delete(s.get(TelegramAccount, owner))
        logger.info("telegram: link moved to another Voxlace account of the same person")
    with user_session(user_id) as s:
        s.get(TelegramLinkToken, _hash(token)).used_at = datetime.now(UTC)
        account = s.get(TelegramAccount, user_id)
        if account is None:
            s.add(TelegramAccount(user_id=user_id, tg_user_id=tg_id, tg_username=tg_username))
        else:
            account.tg_user_id, account.tg_username = tg_id, tg_username
        if moved and s.get(TelegramChannel, user_id) is None:
            s.add(TelegramChannel(user_id=user_id, **moved))
        else:
            moved = None
    logger.info("telegram: account linked")
    if moved:
        _say(api, tg_id, f"Linked to Voxlace. {moved['title']} is connected to this account now.")
        return
    _say(
        api,
        tg_id,
        "Linked to Voxlace. Now add me to your channel: tap the button, pick the channel and "
        "confirm. The admin rights are already filled in.",
        [("Add me to a channel", connect_url())],
    )


def _on_member_change(change: dict, api: TelegramAPI) -> None:
    chat = change.get("chat") or {}
    if chat.get("type") != "channel" or not chat.get("id"):
        return
    member = change.get("new_chat_member") or {}
    state = member.get("status")
    chat_id = int(chat["id"])
    title = str(chat.get("title") or "your channel")[:256]
    adder = int((change.get("from") or {}).get("id") or 0)

    if state in ("left", "kicked"):
        owner = _lookup("user_for_telegram_chat", chat_id)
        if owner is not None:
            disconnect(owner)
            logger.info("telegram: channel disconnected (bot removed)")
            if adder:
                _say(
                    api, adder, f"I was removed from {title}, so Voxlace can't post there any more."
                )
        return
    if state != "administrator":
        return

    user_id = _lookup("user_for_telegram_user", adder) if adder else None
    if user_id is None:
        # Added by someone who never linked: they get the steps (only if they started the bot).
        _say(api, adder, "I can't tell which Voxlace account this is. " + HELP)
        return
    owner = _lookup("user_for_telegram_chat", chat_id)
    if owner is not None and owner != user_id:
        _say(api, adder, f"{title} is already connected to another Voxlace account.")
        return
    can_post = bool(member.get("can_post_messages"))
    with user_session(user_id) as s:
        existing = s.get(TelegramChannel, user_id)
        if existing is not None and existing.chat_id != chat_id:
            s.delete(existing)  # one channel per account: the newest one wins
            s.flush()
            existing = None
        if existing is None:
            s.add(
                TelegramChannel(
                    user_id=user_id,
                    chat_id=chat_id,
                    title=title,
                    username=chat.get("username"),
                    can_post=can_post,
                )
            )
        else:
            existing.title, existing.username, existing.can_post = (
                title,
                chat.get("username"),
                can_post,
            )
    logger.info("telegram: channel connected (can_post=%s)", can_post)
    _say(
        api,
        adder,
        f"Connected to {title}. In Voxlace, approved Telegram drafts now have "
        "“Post to Telegram now”."
        if can_post
        else f"I'm an admin of {title} but can't post. Turn on “Post messages” for me in the "
        "channel's admin settings.",
    )


# ---- posting -------------------------------------------------------------------------------


MAX_LATE = timedelta(minutes=30)  # later than this, a planned post is missed, not sent


def _send(s, user_id: uuid.UUID, d: Draft, current: library.DraftDetail, api: TelegramAPI) -> None:
    """Send a locked, approved Telegram draft to the user's channel and mark it Posted, in the
    caller's transaction. Raises DraftError with a plain reason when it can't."""
    if d.platform != "telegram":
        raise DraftError("not_telegram", "Only Telegram drafts can be posted by the bot.")
    if d.status == "published":
        raise DraftError("already_published", "This post is already published.", 409)
    if d.status != "approved":
        raise DraftError("not_approved", "Approve the draft before posting it.", 409)
    if current.length.over:
        over = current.length.count - current.length.limit
        raise DraftError("over_limit", f"Cut {over} characters before posting.", 409)
    bot = f"@{get_settings().telegram_bot_username}"
    channel = s.get(TelegramChannel, user_id)
    if channel is None:
        raise DraftError(
            "no_channel", "Connect your Telegram channel first: Profile → Connections.", 409
        )
    if not channel.can_post:
        raise DraftError(
            "cannot_post",
            f"Voxlace can't post in {channel.title}. Turn on “Post messages” for {bot} in the "
            "channel's admin settings.",
            409,
        )
    try:
        api.send_message(channel.chat_id, current.text)
    except TelegramError as e:
        if e.code == 0:
            raise DraftError(
                "telegram_unavailable",
                "Telegram can't be reached right now. Your draft is still approved; try again "
                "in a minute.",
                503,
            ) from None
        raise DraftError(
            "telegram_refused",
            f"Telegram didn't let Voxlace post in {channel.title}. Make {bot} an admin with "
            "“Post messages” again (Profile → Connections).",
            409,
        ) from None
    d.bot_failed_at = d.bot_error = None
    library.mark_published(s, user_id, d, current)


def post_draft(user_id: uuid.UUID, draft_id: uuid.UUID, api: TelegramAPI) -> library.DraftDetail:
    """Post now: an approved Telegram draft goes to the connected channel at once, then it is
    Posted. The row is locked while sending, so a double click can never post twice."""
    current = library.detail(user_id, draft_id)  # 404 first
    with user_session(user_id) as s:
        _send(s, user_id, s.get(Draft, draft_id, with_for_update=True), current, api)
    logger.info("telegram: draft posted")
    return library.detail(user_id, draft_id)


def send_due(api: TelegramAPI) -> int:
    """One pass of the background sender (ADR 0001): post every approved Telegram draft whose
    time has come, at most MAX_LATE ago, for users whose channel lets the bot post. Each row is
    locked with SKIP LOCKED, so two API processes never send the same draft. A refusal is kept
    on the draft (not retried) and it shows as missed. Returns how many were posted."""
    with get_engine().connect() as conn:
        due = conn.execute(
            text("SELECT user_id, draft_id FROM telegram_drafts_due(:late)"),
            {"late": MAX_LATE},
        ).all()
    posted = 0
    for user_id, draft_id in due:
        try:
            current = library.detail(user_id, draft_id)
        except DraftError:
            continue  # deleted since
        with user_session(user_id) as s:
            d = s.scalars(
                select(Draft).where(Draft.id == draft_id).with_for_update(skip_locked=True)
            ).first()
            # Another process has it, or it changed since the lookup (un-approved, moved).
            if (
                d is None
                or d.status != "approved"
                or d.bot_failed_at is not None
                or d.scheduled_for is None
                or d.scheduled_for > datetime.now(UTC)
            ):
                continue
            try:
                _send(s, user_id, d, current, api)
                posted += 1
            except DraftError as e:
                if e.code == "telegram_unavailable":
                    continue  # Telegram is down: try again on the next pass
                d.bot_failed_at = datetime.now(UTC)
                d.bot_error = e.message[:300]
                logger.info("telegram: scheduled post refused (%s)", e.code)
    if posted:
        logger.info("telegram: %d scheduled post(s) sent", posted)
    return posted
