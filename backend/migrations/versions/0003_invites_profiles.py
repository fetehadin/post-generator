"""invites and the profiles shell (Phase 2)

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-19 15:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

CURRENT_USER = "NULLIF(current_setting('app.user_id', true), '')::uuid"

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Who may join (FR-28). No user_id and no RLS (SRS §7): codes are looked up before the
    # user exists, and no endpoint lists them. Admins create them with `python -m app.dev invite`.
    op.create_table(
        "invites",
        sa.Column("code", sa.String(length=64), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=True),
        sa.Column("used_by", sa.Uuid(), nullable=True),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["used_by"], ["users.id"], name=op.f("fk_invites_used_by_users"), ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("code", name=op.f("pk_invites")),
    )
    # The About-you form arrives in Phase 3; Phase 2 only creates the row per user.
    op.create_table(
        "profiles",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_profiles_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("user_id", name=op.f("pk_profiles")),
    )
    op.execute("ALTER TABLE profiles ENABLE ROW LEVEL SECURITY")
    op.execute(
        f"CREATE POLICY profiles_own_rows ON profiles "
        f"USING (user_id = {CURRENT_USER}) WITH CHECK (user_id = {CURRENT_USER})"
    )


def downgrade() -> None:
    op.drop_table("profiles")
    op.drop_table("invites")
