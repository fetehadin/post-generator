"""GitHub → daily dev drafts: connection, repos, activity, digests (FR-14)

Revision ID: 0017
Revises: 0016
Create Date: 2026-11-20 14:00:00

Every table is the user's own, with row-level security. Two narrow functions (owned by the
table owner, returning ids only) let the background job and the webhook find the right user
without seeing anyone's rows: `github_connected_users()` and
`user_for_github_installation(installation_id)`.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

CURRENT_USER = "NULLIF(current_setting('app.user_id', true), '')::uuid"

revision: str = "0017"
down_revision: str | None = "0016"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TABLES = ("github_connections", "github_repos", "github_items", "github_digests")


def _created() -> sa.Column:
    return sa.Column(
        "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
    )


def _user(table: str, primary: bool = False) -> sa.Column:
    return sa.Column(
        "user_id",
        sa.Uuid(),
        sa.ForeignKey("users.id", ondelete="CASCADE", name=op.f(f"fk_{table}_user_id_users")),
        nullable=False,
        primary_key=primary,
    )


def upgrade() -> None:
    op.create_table(
        "github_connections",
        _user("github_connections", primary=True),
        sa.Column("github_user_id", sa.BigInteger(), nullable=False),
        sa.Column("login", sa.String(64), nullable=False),
        sa.Column("sealed_token", sa.Text(), nullable=False),
        sa.Column("installation_id", sa.BigInteger(), nullable=True, unique=True),
        sa.Column("frequency", sa.String(16), server_default="daily", nullable=False),
        sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True),
        _created(),
        sa.CheckConstraint(
            "frequency IN ('daily', 'weekly', 'highlights')",
            name=op.f("ck_github_connections_frequency"),
        ),
    )
    op.create_table(
        "github_repos",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        _user("github_repos"),
        sa.Column("repo_id", sa.BigInteger(), nullable=False),
        sa.Column("full_name", sa.String(200), nullable=False),
        sa.Column("private", sa.Boolean(), nullable=False),
        sa.Column("mention_ok", sa.Boolean(), nullable=False),
        sa.Column(
            "languages", postgresql.ARRAY(sa.String(40)), server_default="{}", nullable=False
        ),
        sa.Column("repo_created_at", sa.DateTime(timezone=True), nullable=True),
        _created(),
        sa.UniqueConstraint("user_id", "repo_id", name=op.f("uq_github_repos_user_id")),
    )
    op.create_table(
        "github_items",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        _user("github_items"),
        sa.Column(
            "repo_id",
            sa.Uuid(),
            sa.ForeignKey(
                "github_repos.id", ondelete="CASCADE", name=op.f("fk_github_items_repo_id")
            ),
            nullable=False,
        ),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("external_id", sa.String(80), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("body", sa.Text(), server_default="", nullable=False),
        sa.Column("state", sa.String(16), nullable=True),
        sa.Column("happened_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("files_changed", sa.Integer(), nullable=True),
        sa.Column("additions", sa.Integer(), nullable=True),
        sa.Column("deletions", sa.Integer(), nullable=True),
        sa.Column("deps_only", sa.Boolean(), server_default="false", nullable=False),
        _created(),
        sa.UniqueConstraint(
            "user_id", "repo_id", "kind", "external_id", name=op.f("uq_github_items_user_id")
        ),
        sa.CheckConstraint(
            "kind IN ('commit', 'pr', 'release')", name=op.f("ck_github_items_kind")
        ),
    )
    op.create_index("ix_github_items_happened_at", "github_items", ["happened_at"])
    op.create_table(
        "github_digests",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        _user("github_digests"),
        sa.Column("day", sa.Date(), nullable=False),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("score", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("angle", sa.Text(), nullable=True),
        sa.Column("item_ids", postgresql.ARRAY(sa.Uuid()), server_default="{}", nullable=False),
        sa.Column(
            "thread_id",
            sa.Uuid(),
            sa.ForeignKey("threads.id", ondelete="SET NULL", name=op.f("fk_github_digests_thread")),
            nullable=True,
        ),
        sa.Column("discarded", sa.Integer(), server_default="0", nullable=False),
        _created(),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.UniqueConstraint("user_id", "day", "kind", name=op.f("uq_github_digests_user_id")),
        sa.CheckConstraint("kind IN ('daily', 'weekly')", name=op.f("ck_github_digests_kind")),
        sa.CheckConstraint(
            "status IN ('nothing', 'suggested', 'skipped')", name=op.f("ck_github_digests_status")
        ),
    )
    for table in TABLES:
        if table != "github_connections":
            op.create_index(f"ix_{table}_user_id", table, ["user_id"])
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(
            f"CREATE POLICY {table}_own_rows ON {table} "
            f"USING (user_id = {CURRENT_USER}) WITH CHECK (user_id = {CURRENT_USER})"
        )

    # Ids only, never rows. A pinned search_path and qualified names, so a temporary
    # look-alike table can't be swapped in (the 0007 follow-up, done right here).
    for name, sql in (
        (
            "github_connected_users()",
            "CREATE FUNCTION github_connected_users() RETURNS SETOF uuid "
            "LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp "
            "AS $$ SELECT user_id FROM public.github_connections $$",
        ),
        (
            "user_for_github_installation(bigint)",
            "CREATE FUNCTION user_for_github_installation(inst bigint) RETURNS uuid "
            "LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp "
            "AS $$ SELECT user_id FROM public.github_connections WHERE installation_id = inst $$",
        ),
    ):
        op.execute(sql)
        op.execute(f"REVOKE ALL ON FUNCTION {name} FROM PUBLIC")
        op.execute(
            "DO $$ BEGIN IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'voxlace_app') THEN "
            f"GRANT EXECUTE ON FUNCTION {name} TO voxlace_app; END IF; END $$"
        )


def downgrade() -> None:
    op.execute("DROP FUNCTION IF EXISTS user_for_github_installation(bigint)")
    op.execute("DROP FUNCTION IF EXISTS github_connected_users()")
    for table in reversed(TABLES):
        op.drop_table(table)
