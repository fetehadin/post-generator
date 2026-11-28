"""Pictures on a draft (FR-58, ADR 0002)

Revision ID: 0021
Revises: 0020
Create Date: 2026-11-28 12:00:00

A new user-owned table with row-level security, and one new column on platform_profiles:
`media_char_limit`, the limit when a post carries pictures (Telegram's caption limit, 1,024).
Nothing is dropped or renamed. The files themselves live in the picture folder
(`PICTURES_DIR`), never in the database.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

CURRENT_USER = "NULLIF(current_setting('app.user_id', true), '')::uuid"

revision: str = "0021"
down_revision: str | None = "0020"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "draft_pictures",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column(
            "user_id",
            sa.Uuid(),
            sa.ForeignKey("users.id", ondelete="CASCADE", name="fk_draft_pictures_user_id_users"),
            nullable=False,
        ),
        sa.Column(
            "draft_id",
            sa.Uuid(),
            sa.ForeignKey(
                "drafts.id", ondelete="CASCADE", name="fk_draft_pictures_draft_id_drafts"
            ),
            nullable=False,
        ),
        sa.Column("position", sa.SmallInteger(), nullable=False),
        sa.Column("file_name", sa.String(64), nullable=False),
        sa.Column("content_type", sa.String(32), nullable=False),
        sa.Column("bytes", sa.Integer(), nullable=False),
        sa.Column("width", sa.Integer(), nullable=False),
        sa.Column("height", sa.Integer(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index("ix_draft_pictures_draft_id", "draft_pictures", ["draft_id"])
    op.execute("ALTER TABLE draft_pictures ENABLE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY draft_pictures_own_rows ON draft_pictures "
        f"USING (user_id = {CURRENT_USER}) WITH CHECK (user_id = {CURRENT_USER})"
    )

    op.add_column("platform_profiles", sa.Column("media_char_limit", sa.Integer(), nullable=True))
    op.execute("UPDATE platform_profiles SET media_char_limit = 1024 WHERE platform = 'telegram'")


def downgrade() -> None:
    op.drop_column("platform_profiles", "media_char_limit")
    op.drop_table("draft_pictures")
