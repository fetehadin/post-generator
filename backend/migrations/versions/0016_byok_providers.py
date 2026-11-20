"""users' own AI keys: six providers, a chosen model, a masked prefix (FR-48)

Revision ID: 0016
Revises: 0015
Create Date: 2026-11-20 10:00:00

The provider check widens from (google, groq) to six providers; existing rows stay valid.
`model` is the model the user picked (NULL = the provider's default from settings) and
`prefix` the first characters shown in "sk-…a9F2". Existing rows get an empty prefix.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0016"
down_revision: str | None = "0015"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SIX = "provider IN ('google', 'groq', 'openai', 'anthropic', 'openrouter', 'mistral')"
TWO = "provider IN ('google', 'groq')"


def upgrade() -> None:
    op.drop_constraint(op.f("ck_user_ai_keys_provider"), "user_ai_keys", type_="check")
    op.create_check_constraint(op.f("ck_user_ai_keys_provider"), "user_ai_keys", SIX)
    op.add_column("user_ai_keys", sa.Column("model", sa.String(128), nullable=True))
    op.add_column(
        "user_ai_keys", sa.Column("prefix", sa.String(8), server_default="", nullable=False)
    )


def downgrade() -> None:
    # Keys for the four new providers can't exist under the old check: they go first.
    op.execute("DELETE FROM user_ai_keys WHERE provider NOT IN ('google', 'groq')")
    op.drop_column("user_ai_keys", "prefix")
    op.drop_column("user_ai_keys", "model")
    op.drop_constraint(op.f("ck_user_ai_keys_provider"), "user_ai_keys", type_="check")
    op.create_check_constraint(op.f("ck_user_ai_keys_provider"), "user_ai_keys", TWO)
