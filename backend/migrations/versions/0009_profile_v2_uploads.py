"""profile v2 and resume/portfolio uploads (FR-17, FR-20, FR-21)

Revision ID: 0009
Revises: 0008
Create Date: 2026-10-22 22:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

CURRENT_USER = "NULLIF(current_setting('app.user_id', true), '')::uuid"

revision: str = "0009"
down_revision: str | None = "0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TEXT_FIELDS = ("seniority", "facts", "emoji_habit", "hashtag_habit", "portfolio_url")


def upgrade() -> None:
    for name in TEXT_FIELDS:
        op.add_column("profiles", sa.Column(name, sa.Text(), server_default="", nullable=False))
    # Projects as a list, so the chat can ask "which one?" (FR-40):
    # [{"name": "Voxlace", "line": "drafts posts in your voice", "link": "…", "status": "building"}]
    op.add_column(
        "profiles", sa.Column("projects", postgresql.JSONB(), server_default="[]", nullable=False)
    )

    # Text taken from a resume or portfolio page. The file itself is never kept (NFR-11), and
    # contact details are removed before saving (FR-21); only text the user marked reviewed
    # reaches the AI. `removed` counts what was taken out, e.g. {"emails": 1, "phones": 2}.
    op.create_table(
        "uploads",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("kind", sa.String(length=16), nullable=False),
        sa.Column("source", sa.Text(), nullable=False),  # the file name or the URL
        sa.Column("cleaned_text", sa.Text(), nullable=False),
        sa.Column("removed", postgresql.JSONB(), server_default="{}", nullable=False),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint("kind IN ('resume', 'portfolio')", name=op.f("ck_uploads_kind")),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_uploads_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_uploads")),
    )
    op.create_index("ix_uploads_user_id", "uploads", ["user_id"])
    op.execute("ALTER TABLE uploads ENABLE ROW LEVEL SECURITY")
    op.execute(
        f"CREATE POLICY uploads_own_rows ON uploads "
        f"USING (user_id = {CURRENT_USER}) WITH CHECK (user_id = {CURRENT_USER})"
    )


def downgrade() -> None:
    op.drop_table("uploads")
    op.drop_column("profiles", "projects")
    for name in reversed(TEXT_FIELDS):
        op.drop_column("profiles", name)
