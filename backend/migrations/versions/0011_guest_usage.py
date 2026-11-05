"""guest usage: how many drafts guests wrote per day, for the guest limits (FR-47)

Revision ID: 0011
Revises: 0010
Create Date: 2026-11-05 10:00:00

Guests (no login) can draft without anything of theirs being stored. The only row is a
counter per UTC day and per hashed IP address (never the address itself), so one visitor
can't use up the shared free AI quota. No user_id, so no row-level security: like
`invites`, it isn't user-owned data. Rows older than a few days are deleted by the API.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0011"
down_revision: str | None = "0010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "guest_usage",
        sa.Column("day", sa.Date(), nullable=False),
        # sha256 of a server secret + the address: counts a visitor without knowing who it is.
        sa.Column("visitor", sa.String(64), nullable=False),
        sa.Column("drafts", sa.Integer(), nullable=False, server_default="0"),
        sa.PrimaryKeyConstraint("day", "visitor"),
    )


def downgrade() -> None:
    op.drop_table("guest_usage")
