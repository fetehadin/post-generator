"""Chat actions: pin and archive a chat (FR-55)

Revision ID: 0020
Revises: 0019
Create Date: 2026-11-27 12:00:00

Two columns on threads, nothing dropped. `pinned` keeps a chat at the top of the sidebar;
`archived_at` hides it under "Archived" until it is restored (NULL = not archived).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0020"
down_revision: str | None = "0019"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "threads", sa.Column("pinned", sa.Boolean(), server_default="false", nullable=False)
    )
    op.add_column("threads", sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("threads", "archived_at")
    op.drop_column("threads", "pinned")
