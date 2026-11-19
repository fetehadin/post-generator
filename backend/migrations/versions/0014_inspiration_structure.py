"""inspiration pool: creators' posts for structure, tags and local vectors (FR-41, rule 3)

Revision ID: 0014
Revises: 0013
Create Date: 2026-11-19 16:00:00

Only adds columns and indexes; the 24 team templates stay as they are (source 'template').
Creators' posts are added by `python -m app.dev import-inspiration` from files that are never
committed. Vectors come from the local model (384 dims), a different space from users' posts
(Gemini, 768); `embedding_model` names the model that made them.

HNSW indexes for cosine distance. The pool is small (hundreds of posts), so Postgres may still
scan the table; the index keeps searches fast as the pool grows.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from pgvector.sqlalchemy import Vector

revision: str = "0014"
down_revision: str | None = "0013"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

DIMS = 384


def upgrade() -> None:
    add = lambda col: op.add_column("exemplar_posts", col)  # noqa: E731
    add(sa.Column("source", sa.String(16), server_default="template", nullable=False))
    add(sa.Column("author", sa.String(64), nullable=True))
    add(sa.Column("text_hash", sa.String(64), nullable=True))
    add(sa.Column("hook_type", sa.String(32), nullable=True))
    add(sa.Column("structure", sa.Text(), nullable=True))
    add(sa.Column("tone", sa.String(32), nullable=True))
    add(sa.Column("goal", sa.String(16), nullable=True))
    add(sa.Column("source_profession", sa.String(48), nullable=True))
    add(sa.Column("tagged_at", sa.DateTime(timezone=True), nullable=True))
    add(sa.Column("embedding", Vector(DIMS), nullable=True))
    add(sa.Column("structure_embedding", Vector(DIMS), nullable=True))
    add(sa.Column("embedding_model", sa.String(128), nullable=True))
    op.create_check_constraint(
        op.f("ck_exemplar_posts_source"), "exemplar_posts", "source IN ('template', 'creator')"
    )
    # The templates get their hash too, so an import can never add one of them twice.
    op.execute(
        "UPDATE exemplar_posts SET text_hash = encode(sha256(convert_to(text, 'UTF8')), 'hex')"
    )
    op.create_index(
        "uq_exemplar_posts_platform_text_hash",
        "exemplar_posts",
        ["platform", "text_hash"],
        unique=True,
    )
    for col in ("embedding", "structure_embedding"):
        op.execute(
            f"CREATE INDEX ix_exemplar_posts_{col}_hnsw ON exemplar_posts "
            f"USING hnsw ({col} vector_cosine_ops)"
        )


def downgrade() -> None:
    for col in ("embedding", "structure_embedding"):
        op.execute(f"DROP INDEX IF EXISTS ix_exemplar_posts_{col}_hnsw")
    op.drop_index("uq_exemplar_posts_platform_text_hash", table_name="exemplar_posts")
    op.drop_constraint(op.f("ck_exemplar_posts_source"), "exemplar_posts", type_="check")
    for name in (
        "embedding_model",
        "structure_embedding",
        "embedding",
        "tagged_at",
        "source_profession",
        "goal",
        "tone",
        "structure",
        "hook_type",
        "text_hash",
        "author",
        "source",
    ):
        op.drop_column("exemplar_posts", name)
