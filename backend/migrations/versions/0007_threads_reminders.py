"""chat threads, versions for another platform, in-app reminders, the embedding retry
(FR-40, FR-42, FR-46, NFR-14)

Revision ID: 0007
Revises: 0006
Create Date: 2026-10-22 18:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

CURRENT_USER = "NULLIF(current_setting('app.user_id', true), '')::uuid"

revision: str = "0007"
down_revision: str | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _own_rows(table: str) -> None:
    op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
    op.execute(
        f"CREATE POLICY {table}_own_rows ON {table} "
        f"USING (user_id = {CURRENT_USER}) WITH CHECK (user_id = {CURRENT_USER})"
    )


def upgrade() -> None:
    # One conversation on the chat board: a check-in, its drafts and every revision (FR-46).
    op.create_table(
        "threads",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.Text(), server_default="", nullable=False),
        sa.Column("checkin_id", sa.Uuid(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_threads_user_id_users"), ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["checkin_id"],
            ["checkins.id"],
            name=op.f("fk_threads_checkin_id_checkins"),
            ondelete="SET NULL",
        ),  # fmt: skip
        sa.PrimaryKeyConstraint("id", name=op.f("pk_threads")),
    )
    op.create_index("ix_threads_user_updated", "threads", ["user_id", "updated_at"])
    _own_rows("threads")

    op.add_column("drafts", sa.Column("thread_id", sa.Uuid(), nullable=True))
    op.create_foreign_key(
        op.f("fk_drafts_thread_id_threads"), "drafts", "threads", ["thread_id"], ["id"],
        ondelete="SET NULL",
    )  # fmt: skip
    op.create_index("ix_drafts_thread_id", "drafts", ["thread_id"])
    # The draft this one was written from, for "make a LinkedIn version" (FR-40).
    op.add_column("drafts", sa.Column("source_draft_id", sa.Uuid(), nullable=True))
    op.create_foreign_key(
        op.f("fk_drafts_source_draft_id_drafts"), "drafts", "drafts", ["source_draft_id"], ["id"],
        ondelete="SET NULL",
    )  # fmt: skip

    # Messages now belong to a thread; a message about no single draft has no draft_id.
    op.add_column("draft_messages", sa.Column("thread_id", sa.Uuid(), nullable=True))
    op.create_foreign_key(
        op.f("fk_draft_messages_thread_id_threads"), "draft_messages", "threads", ["thread_id"],
        ["id"], ondelete="CASCADE",
    )  # fmt: skip
    op.create_index("ix_draft_messages_thread_id", "draft_messages", ["thread_id"])
    op.alter_column("draft_messages", "draft_id", nullable=True)

    # Every existing draft gets a thread of its own, holding its chat (runs as the table owner,
    # so RLS doesn't hide rows here). The thread borrows the draft's id to link them.
    op.execute(
        """
        INSERT INTO threads (id, user_id, title, checkin_id, created_at, updated_at)
        SELECT id, user_id, left(split_part(topic, E'\\n', 1), 80), checkin_id, created_at,
               created_at
        FROM drafts
        """
    )
    op.execute("UPDATE drafts SET thread_id = id")
    op.execute("UPDATE draft_messages SET thread_id = draft_id")

    # Daily check-in reminders, shown in the app (FR-42). days: 0 = Monday … 6 = Sunday.
    op.create_table(
        "reminder_settings",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("enabled", sa.Boolean(), server_default="false", nullable=False),
        sa.Column(
            "days",
            postgresql.ARRAY(sa.SmallInteger()),
            server_default="{0,1,2,3,4}",
            nullable=False,
        ),  # fmt: skip
        sa.Column("local_time", sa.Time(), server_default="18:00", nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_reminder_settings_user_id_users"),
            ondelete="CASCADE",
        ),  # fmt: skip
        sa.PrimaryKeyConstraint("user_id", name=op.f("pk_reminder_settings")),
    )
    _own_rows("reminder_settings")

    # NFR-14: the background retry must find users whose posts still wait for embedding, but
    # the app role sees no rows without a user set. This function, owned by the table owner,
    # returns only those user ids, nothing else. The retry then works as each user.
    op.execute(
        """
        CREATE FUNCTION users_waiting_for_embeddings() RETURNS SETOF uuid
        LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
            SELECT DISTINCT user_id FROM source_posts
            WHERE embedding IS NULL AND excluded = false
        $$
        """
    )
    op.execute("REVOKE ALL ON FUNCTION users_waiting_for_embeddings() FROM PUBLIC")
    op.execute(
        "DO $$ BEGIN IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'voxlace_app') THEN "
        "GRANT EXECUTE ON FUNCTION users_waiting_for_embeddings() TO voxlace_app; END IF; END $$"
    )


def downgrade() -> None:
    op.execute("DROP FUNCTION users_waiting_for_embeddings()")
    op.drop_table("reminder_settings")
    op.execute("DELETE FROM draft_messages WHERE draft_id IS NULL")
    op.alter_column("draft_messages", "draft_id", nullable=False)
    op.drop_index("ix_draft_messages_thread_id", table_name="draft_messages")
    op.drop_constraint(
        op.f("fk_draft_messages_thread_id_threads"), "draft_messages", type_="foreignkey"
    )
    op.drop_column("draft_messages", "thread_id")
    op.drop_constraint(op.f("fk_drafts_source_draft_id_drafts"), "drafts", type_="foreignkey")
    op.drop_column("drafts", "source_draft_id")
    op.drop_index("ix_drafts_thread_id", table_name="drafts")
    op.drop_constraint(op.f("fk_drafts_thread_id_threads"), "drafts", type_="foreignkey")
    op.drop_column("drafts", "thread_id")
    op.drop_table("threads")
