"""Telegram bot: link your account, connect a channel, post approved drafts (FR-36)

Revision ID: 0018
Revises: 0017
Create Date: 2026-11-23 10:00:00

Every table is the user's own, with row-level security. The webhook has no logged-in user, so
three narrow functions (owned by the table owner, returning a user id only) let it find who a
Telegram update is about, then it works as that user under RLS:
`user_for_telegram_token(hash)`, `user_for_telegram_user(id)`, `user_for_telegram_chat(id)`.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

CURRENT_USER = "NULLIF(current_setting('app.user_id', true), '')::uuid"

revision: str = "0018"
down_revision: str | None = "0017"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TABLES = ("telegram_link_tokens", "telegram_accounts", "telegram_channels")


def _created() -> sa.Column:
    return sa.Column(
        "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
    )


def _user(table: str, primary: bool = False) -> sa.Column:
    return sa.Column(
        "user_id",
        sa.Uuid(),
        sa.ForeignKey("users.id", ondelete="CASCADE", name=op.f(f"fk_{table}_user_id_users")),
        nullable=False,
        primary_key=primary,
    )


def upgrade() -> None:
    # One-time "link your account" tokens: only a SHA-256 of the token is kept.
    op.create_table(
        "telegram_link_tokens",
        sa.Column("token_hash", sa.String(64), primary_key=True),
        _user("telegram_link_tokens"),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        _created(),
    )
    op.create_index("ix_telegram_link_tokens_user_id", "telegram_link_tokens", ["user_id"])
    # Which Telegram account is this Voxlace user (one each way).
    op.create_table(
        "telegram_accounts",
        _user("telegram_accounts", primary=True),
        sa.Column("tg_user_id", sa.BigInteger(), nullable=False, unique=True),
        sa.Column("tg_username", sa.String(64), nullable=True),
        _created(),
    )
    # The channel the bot may post to (one per user; a channel belongs to one account).
    op.create_table(
        "telegram_channels",
        _user("telegram_channels", primary=True),
        sa.Column("chat_id", sa.BigInteger(), nullable=False, unique=True),
        sa.Column("title", sa.String(256), nullable=False),
        sa.Column("username", sa.String(64), nullable=True),
        sa.Column("can_post", sa.Boolean(), nullable=False),
        _created(),
    )
    for table in TABLES:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(
            f"CREATE POLICY {table}_own_rows ON {table} "
            f"USING (user_id = {CURRENT_USER}) WITH CHECK (user_id = {CURRENT_USER})"
        )

    # Ids only, never rows; a pinned search_path and qualified names (as in 0017).
    for name, sql in (
        (
            "user_for_telegram_token(text)",
            "CREATE FUNCTION user_for_telegram_token(h text) RETURNS uuid "
            "LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp "
            "AS $$ SELECT user_id FROM public.telegram_link_tokens WHERE token_hash = h "
            "AND used_at IS NULL AND expires_at > now() $$",
        ),
        (
            "user_for_telegram_user(bigint)",
            "CREATE FUNCTION user_for_telegram_user(tg bigint) RETURNS uuid "
            "LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp "
            "AS $$ SELECT user_id FROM public.telegram_accounts WHERE tg_user_id = tg $$",
        ),
        (
            "user_for_telegram_chat(bigint)",
            "CREATE FUNCTION user_for_telegram_chat(chat bigint) RETURNS uuid "
            "LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp "
            "AS $$ SELECT user_id FROM public.telegram_channels WHERE chat_id = chat $$",
        ),
    ):
        op.execute(sql)
        op.execute(f"REVOKE ALL ON FUNCTION {name} FROM PUBLIC")
        op.execute(
            "DO $$ BEGIN IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'voxlace_app') THEN "
            f"GRANT EXECUTE ON FUNCTION {name} TO voxlace_app; END IF; END $$"
        )


def downgrade() -> None:
    op.execute("DROP FUNCTION IF EXISTS user_for_telegram_chat(bigint)")
    op.execute("DROP FUNCTION IF EXISTS user_for_telegram_user(bigint)")
    op.execute("DROP FUNCTION IF EXISTS user_for_telegram_token(text)")
    for table in reversed(TABLES):
        op.drop_table(table)
