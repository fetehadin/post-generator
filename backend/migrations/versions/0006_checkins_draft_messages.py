"""check-ins and the draft chat (FR-6, FR-10, FR-40)

Revision ID: 0006
Revises: 0005
Create Date: 2026-10-22 12:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

CURRENT_USER = "NULLIF(current_setting('app.user_id', true), '')::uuid"

revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _own_rows(table: str) -> None:
    op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
    op.execute(
        f"CREATE POLICY {table}_own_rows ON {table} "
        f"USING (user_id = {CURRENT_USER}) WITH CHECK (user_id = {CURRENT_USER})"
    )


def _timestamps() -> list[sa.Column]:
    return [
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        )
    ]


def upgrade() -> None:
    # A daily note: what the user did. `day` is the user's own calendar day (FR-6).
    op.create_table(
        "checkins",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("day", sa.Date(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        *_timestamps(),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_checkins_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_checkins")),
    )
    op.create_index("ix_checkins_user_day", "checkins", ["user_id", "day"])
    _own_rows("checkins")

    # The editor's chat: what the user asked and what the assistant answered (FR-40).
    op.create_table(
        "draft_messages",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("draft_id", sa.Uuid(), nullable=False),
        sa.Column("role", sa.String(length=16), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("draft_version_id", sa.Uuid(), nullable=True),
        *_timestamps(),
        sa.CheckConstraint("role IN ('user', 'assistant')", name=op.f("ck_draft_messages_role")),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_draft_messages_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["draft_id"],
            ["drafts.id"],
            name=op.f("fk_draft_messages_draft_id_drafts"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["draft_version_id"],
            ["draft_versions.id"],
            name=op.f("fk_draft_messages_draft_version_id_draft_versions"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_draft_messages")),
    )
    op.create_index("ix_draft_messages_draft_id", "draft_messages", ["draft_id"])
    _own_rows("draft_messages")

    # Which check-in a draft came from, and the calendar's lookups (FR-13).
    op.add_column("drafts", sa.Column("checkin_id", sa.Uuid(), nullable=True))
    op.create_foreign_key(
        op.f("fk_drafts_checkin_id_checkins"), "drafts", "checkins", ["checkin_id"], ["id"],
        ondelete="SET NULL",
    )  # fmt: skip
    op.create_index("ix_drafts_user_scheduled", "drafts", ["user_id", "scheduled_for"])


def downgrade() -> None:
    op.drop_index("ix_drafts_user_scheduled", table_name="drafts")
    op.drop_constraint(op.f("fk_drafts_checkin_id_checkins"), "drafts", type_="foreignkey")
    op.drop_column("drafts", "checkin_id")
    op.drop_table("draft_messages")
    op.drop_table("checkins")
