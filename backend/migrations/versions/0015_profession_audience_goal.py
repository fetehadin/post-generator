"""profiles: who they write for and why; existing users default to "developer" (FR-17, FR-41)

Revision ID: 0015
Revises: 0014
Create Date: 2026-11-19 18:00:00

`discipline` already holds the user's field (the form now calls it "Profession"). Only empty
ones are filled with "developer", because every existing user is one; nothing typed is
changed. `audience_kind` and `main_goal` are new and start empty (no guess).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0015"
down_revision: str | None = "0014"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "profiles", sa.Column("audience_kind", sa.String(16), server_default="", nullable=False)
    )
    op.add_column(
        "profiles", sa.Column("main_goal", sa.String(16), server_default="", nullable=False)
    )
    op.create_check_constraint(
        "ck_profiles_audience_kind",
        "profiles",
        "audience_kind IN ('', 'peers', 'clients', 'employers', 'public')",
    )
    op.create_check_constraint(
        "ck_profiles_main_goal",
        "profiles",
        "main_goal IN ('', 'teach', 'sell', 'hire', 'network', 'announce')",
    )
    op.execute("UPDATE profiles SET discipline = 'developer' WHERE btrim(discipline) = ''")


def downgrade() -> None:
    # The filled-in "developer" values stay: they can't be told apart from typed ones.
    op.drop_constraint("ck_profiles_main_goal", "profiles", type_="check")
    op.drop_constraint("ck_profiles_audience_kind", "profiles", type_="check")
    op.drop_column("profiles", "main_goal")
    op.drop_column("profiles", "audience_kind")
