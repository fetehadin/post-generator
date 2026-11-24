"""The bot posts approved Telegram drafts at their planned time (FR-36, ADR 0001)

Revision ID: 0019
Revises: 0018
Create Date: 2026-11-24 10:00:00

Two new nullable columns on drafts record a send the bot couldn't make (so it isn't retried
every minute, and the draft shows as missed with the reason). One narrow function, owned by
the table owner and returning ids only, lets the background sender find what is due without
seeing anyone's rows: `telegram_drafts_due(max_late)`.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0019"
down_revision: str | None = "0018"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

FUNCTION = "telegram_drafts_due(interval)"


def upgrade() -> None:
    op.add_column("drafts", sa.Column("bot_failed_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("drafts", sa.Column("bot_error", sa.String(300), nullable=True))
    # Approved Telegram drafts whose time has come (at most `max_late` ago), not already
    # refused, for users whose connected channel lets the bot post. Ids only.
    op.execute(
        "CREATE FUNCTION telegram_drafts_due(max_late interval) "
        "RETURNS TABLE(user_id uuid, draft_id uuid) "
        "LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp "
        "AS $$ SELECT d.user_id, d.id FROM public.drafts d "
        "JOIN public.telegram_channels c ON c.user_id = d.user_id AND c.can_post "
        "WHERE d.platform = 'telegram' AND d.status = 'approved' "
        "AND d.bot_failed_at IS NULL AND d.scheduled_for <= now() "
        "AND d.scheduled_for > now() - max_late "
        "ORDER BY d.scheduled_for $$"
    )
    op.execute(f"REVOKE ALL ON FUNCTION {FUNCTION} FROM PUBLIC")
    op.execute(
        "DO $$ BEGIN IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'voxlace_app') THEN "
        f"GRANT EXECUTE ON FUNCTION {FUNCTION} TO voxlace_app; END IF; END $$"
    )


def downgrade() -> None:
    op.execute(f"DROP FUNCTION IF EXISTS {FUNCTION}")
    op.drop_column("drafts", "bot_error")
    op.drop_column("drafts", "bot_failed_at")
