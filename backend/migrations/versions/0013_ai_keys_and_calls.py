"""users' own AI keys, a log of every AI call, and who paid for each draft (FR-48, NFR-20)

Revision ID: 0013
Revises: 0012
Create Date: 2026-11-19 12:00:00

- `user_ai_keys`: one encrypted key per user per provider. Only the sealed text is stored;
  the encryption keys live in the server's environment, never here.
- `ai_calls`: one row per logical AI call (purpose, model, key source, attempts, time,
  tokens), never any text. Guests' calls have no user_id: anyone may insert those, nobody
  but the table owner may read them (the team's reports run as the owner).
- `prompt_logs.key_source`: drafts written on the user's own key don't count towards the
  daily limit (FR-30). Existing rows were all written on the app's key.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

CURRENT_USER = "NULLIF(current_setting('app.user_id', true), '')::uuid"

revision: str = "0013"
down_revision: str | None = "0012"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "user_ai_keys",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("provider", sa.String(16), nullable=False),
        sa.Column("sealed_key", sa.Text(), nullable=False),
        sa.Column("last4", sa.String(4), nullable=False),
        sa.Column("status", sa.String(16), server_default="active", nullable=False),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint("provider IN ('google', 'groq')", name=op.f("ck_user_ai_keys_provider")),
        sa.CheckConstraint("status IN ('active', 'rejected')", name=op.f("ck_user_ai_keys_status")),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_user_ai_keys_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("user_id", "provider", name=op.f("pk_user_ai_keys")),
    )
    op.execute("ALTER TABLE user_ai_keys ENABLE ROW LEVEL SECURITY")
    op.execute(
        f"CREATE POLICY user_ai_keys_own_rows ON user_ai_keys "
        f"USING (user_id = {CURRENT_USER}) WITH CHECK (user_id = {CURRENT_USER})"
    )

    op.create_table(
        "ai_calls",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=True),
        sa.Column("purpose", sa.String(32), nullable=False),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("ok", sa.Boolean(), nullable=False),
        sa.Column("provider", sa.String(32), nullable=True),
        sa.Column("model", sa.String(64), nullable=True),
        sa.Column("model_version", sa.String(64), nullable=True),
        sa.Column("key_source", sa.String(8), nullable=True),
        sa.Column("error", sa.String(300), nullable=True),
        sa.Column("attempts", sa.SmallInteger(), nullable=False),
        sa.Column("routes_tried", sa.SmallInteger(), nullable=False),
        sa.Column("latency_ms", sa.Integer(), nullable=False),
        sa.Column("prompt_tokens", sa.Integer(), nullable=True),
        sa.Column("output_tokens", sa.Integer(), nullable=True),
        sa.Column("thinking_tokens", sa.Integer(), nullable=True),
        sa.Column("items", sa.Integer(), server_default="1", nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_ai_calls_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_ai_calls")),
    )
    op.create_index("ix_ai_calls_user_id", "ai_calls", ["user_id"])
    op.create_index("ix_ai_calls_created_at", "ai_calls", ["created_at"])
    op.execute("ALTER TABLE ai_calls ENABLE ROW LEVEL SECURITY")
    op.execute(
        f"CREATE POLICY ai_calls_own_rows ON ai_calls "
        f"USING (user_id = {CURRENT_USER}) "
        f"WITH CHECK (user_id = {CURRENT_USER} OR user_id IS NULL)"
    )

    op.add_column(
        "prompt_logs",
        sa.Column("key_source", sa.String(8), server_default="default", nullable=False),
    )


def downgrade() -> None:
    op.drop_column("prompt_logs", "key_source")
    op.drop_table("ai_calls")
    op.drop_table("user_ai_keys")
