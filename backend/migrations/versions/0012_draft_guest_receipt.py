"""drafts.guest_receipt_id: a guest receipt is saved into an account once (FR-47)

Revision ID: 0012
Revises: 0011
Create Date: 2026-11-05 14:00:00

A guest's drafts are saved after login from signed receipts. Without a record of which
receipts were saved, a save whose answer got lost (a dropped connection) would be retried and
make a second copy, and the same receipt could be saved into any number of accounts. The
unique index holds across all accounts even under row-level security.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0012"
down_revision: str | None = "0011"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("drafts", sa.Column("guest_receipt_id", sa.String(32), nullable=True))
    op.create_unique_constraint("uq_drafts_guest_receipt_id", "drafts", ["guest_receipt_id"])


def downgrade() -> None:
    op.drop_constraint("uq_drafts_guest_receipt_id", "drafts", type_="unique")
    op.drop_column("drafts", "guest_receipt_id")
