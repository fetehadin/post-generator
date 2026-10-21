"""profile fields: the About-you form, language and the summary card (FR-17, FR-18, FR-24, FR-33, FR-44)

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-21 16:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Free-text answers; every one stays editable from the Profile page (FR-17).
TEXT_FIELDS = (
    "role", "stack", "current_projects", "focus", "goal", "topics", "audience",
    "avoid_list", "voice_words", "links", "discipline", "usual_hours",
)  # fmt: skip


def upgrade() -> None:
    for name in TEXT_FIELDS:
        op.add_column("profiles", sa.Column(name, sa.Text(), nullable=False, server_default=""))
    # "auto" writes in the same language mix as the user's own posts (FR-24).
    op.add_column(
        "profiles", sa.Column("language", sa.String(32), nullable=False, server_default="auto")
    )
    # NULL means "use the default list" (FR-44); an empty array means "exclude nothing".
    op.add_column(
        "profiles", sa.Column("excluded_hashtags", postgresql.ARRAY(sa.Text()), nullable=True)
    )
    op.add_column(
        "profiles", sa.Column("summary_card", sa.Text(), nullable=False, server_default="")
    )
    op.add_column(
        "profiles", sa.Column("summary_updated_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column(
        "profiles",
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )


def downgrade() -> None:
    for name in (
        "updated_at",
        "summary_updated_at",
        "summary_card",
        "excluded_hashtags",
        "language",
    ):
        op.drop_column("profiles", name)
    for name in TEXT_FIELDS:
        op.drop_column("profiles", name)
