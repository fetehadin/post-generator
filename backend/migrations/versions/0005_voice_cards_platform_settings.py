"""voice cards and per-user platform settings (FR-5, FR-22, FR-26, Q31)

Revision ID: 0005
Revises: 0004
Create Date: 2026-10-22 09:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

CURRENT_USER = "NULLIF(current_setting('app.user_id', true), '')::uuid"

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _own_rows(table: str) -> None:
    op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
    op.execute(
        f"CREATE POLICY {table}_own_rows ON {table} "
        f"USING (user_id = {CURRENT_USER}) WITH CHECK (user_id = {CURRENT_USER})"
    )


def upgrade() -> None:
    # One voice card per user and platform. `ai_card` is the AI's last text, so lines the
    # user changed by hand can be found and kept when the card is rewritten (FR-26).
    op.create_table(
        "voice_cards",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("platform", sa.String(length=16), nullable=False),
        sa.Column("card", sa.Text(), server_default="", nullable=False),
        sa.Column("ai_card", sa.Text(), server_default="", nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_voice_cards_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("user_id", "platform", name=op.f("pk_voice_cards")),
    )
    _own_rows("voice_cards")

    # Per-user platform choices. x_premium: NULL = unknown, set by the user or guessed from
    # the export (premium_source "user" or "export"); the user's answer wins (Q31).
    op.create_table(
        "platform_settings",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("platform", sa.String(length=16), nullable=False),
        sa.Column("x_premium", sa.Boolean(), nullable=True),
        sa.Column("premium_source", sa.String(length=8), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_platform_settings_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("user_id", "platform", name=op.f("pk_platform_settings")),
    )
    _own_rows("platform_settings")


def downgrade() -> None:
    op.drop_table("platform_settings")
    op.drop_table("voice_cards")
