"""users, imports and source_posts, with row-level security

Revision ID: 0001
Revises:
Create Date: 2026-10-17

Every user-owned table gets its RLS policy in the same migration that creates it
(backend/CLAUDE.md). The app role sees only rows whose user matches app.user_id,
set per transaction by app.core.db.user_session; with no user set it sees nothing.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from pgvector.sqlalchemy import Vector
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# NULLIF: on a reused pooled connection the setting is '' (not NULL) after a request.
CURRENT_USER = "NULLIF(current_setting('app.user_id', true), '')::uuid"


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    op.create_table(
        "users",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=True),
        sa.Column("timezone", sa.String(length=64), server_default="UTC", nullable=False),
        sa.Column("language", sa.String(length=32), server_default="en", nullable=False),
        sa.Column("privacy_accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_users")),
        sa.UniqueConstraint("email", name=op.f("uq_users_email")),
    )
    op.create_table(
        "imports",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("platform", sa.String(length=16), nullable=False),
        sa.Column("status", sa.String(length=16), server_default="parsing", nullable=False),
        sa.Column("parsed", sa.Integer(), server_default="0", nullable=False),
        sa.Column(
            "skipped",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column("embedded", sa.Integer(), server_default="0", nullable=False),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "platform IN ('telegram', 'x', 'linkedin')", name=op.f("ck_imports_platform")
        ),
        sa.CheckConstraint(
            "status IN ('parsing', 'embedding', 'done', 'failed')", name=op.f("ck_imports_status")
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_imports_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_imports")),
    )
    op.create_index(op.f("ix_imports_user_id"), "imports", ["user_id"], unique=False)
    op.create_table(
        "source_posts",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("import_id", sa.Uuid(), nullable=True),
        sa.Column("platform", sa.String(length=16), nullable=False),
        sa.Column("origin", sa.String(length=16), server_default="import", nullable=False),
        sa.Column("external_id", sa.String(length=64), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("posted_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("likes", sa.Integer(), server_default="0", nullable=False),
        sa.Column("reposts", sa.Integer(), server_default="0", nullable=False),
        sa.Column("pinned", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("excluded", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("embedding", Vector(768), nullable=True),
        sa.Column("embedding_model", sa.String(length=64), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("origin IN ('import', 'voxlace')", name=op.f("ck_source_posts_origin")),
        sa.CheckConstraint(
            "platform IN ('telegram', 'x', 'linkedin')", name=op.f("ck_source_posts_platform")
        ),
        sa.CheckConstraint(
            "(embedding IS NULL) = (embedding_model IS NULL)",
            name=op.f("ck_source_posts_embedding_has_model"),
        ),
        sa.ForeignKeyConstraint(
            ["import_id"],
            ["imports.id"],
            name=op.f("fk_source_posts_import_id_imports"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_source_posts_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_source_posts")),
        sa.UniqueConstraint("user_id", "platform", "external_id", name="uq_source_posts_external"),
    )
    op.create_index(
        "ix_source_posts_user_platform", "source_posts", ["user_id", "platform"], unique=False
    )

    # Row-level security: each user sees and writes only their own rows (FR-29, NFR-13).
    op.execute("ALTER TABLE users ENABLE ROW LEVEL SECURITY")
    op.execute(
        f"CREATE POLICY users_self ON users "
        f"USING (id = {CURRENT_USER}) WITH CHECK (id = {CURRENT_USER})"
    )
    for table in ("imports", "source_posts"):
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(
            f"CREATE POLICY {table}_own_rows ON {table} "
            f"USING (user_id = {CURRENT_USER}) WITH CHECK (user_id = {CURRENT_USER})"
        )


def downgrade() -> None:
    op.drop_index("ix_source_posts_user_platform", table_name="source_posts")
    op.drop_table("source_posts")
    op.drop_index(op.f("ix_imports_user_id"), table_name="imports")
    op.drop_table("imports")
    op.drop_table("users")
