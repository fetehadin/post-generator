"""posting times: study-based curves, audience places and profession, posting window
(FR-16, FR-33, FR-34, FR-45)

Revision ID: 0008
Revises: 0007
Create Date: 2026-10-22 20:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0008"
down_revision: str | None = "0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# How active a platform's readers are at each LOCAL hour (0–23), relative to the peak (1.0),
# and how each weekday compares (Monday first). Shapes from the largest studies we found:
# - X: Buffer 2026, 8.7M posts: rises early, peaks ~09:00, fades in the early afternoon,
#   evenings lowest; Tuesday/Wednesday best, Saturday worst, Friday second worst.
# - LinkedIn: Buffer 2026, 4.8M posts: peak moved to 15:00–20:00; Wednesday best, then
#   Thursday and Friday; Monday the weakest weekday; weekends low. Mornings kept moderate,
#   since Sprout Social and Hootsuite still find them good.
# - Telegram: no large independent study; vendor studies agree on weekday mornings
#   (08–10) and evenings (18–21), Tuesday–Thursday strongest. A guess the user's own posts
#   replace once there are 50 with reactions (FR-34).
STUDIES = {
    "x": (
        "Buffer 2026 (8.7M posts)",
        [.15, .10, .08, .08, .10, .20, .45, .70, .90, 1.0, .95, .85,
         .75, .65, .55, .50, .48, .45, .40, .38, .36, .33, .28, .20],
        [.90, 1.0, .98, .92, .80, .65, .72],
    ),
    "linkedin": (
        "Buffer 2026 (4.8M posts); Sprout Social, Hootsuite for mornings",
        [.05, .03, .03, .03, .05, .12, .30, .50, .65, .70, .72, .74,
         .76, .78, .85, .97, 1.0, .95, .88, .80, .70, .50, .30, .12],
        [.75, .90, 1.0, .97, .96, .45, .50],
    ),
    "telegram": (
        "Vendor studies (Schedulala, Lyve); an estimate until your own data takes over",
        [.25, .15, .08, .06, .06, .12, .35, .65, .95, 1.0, .85, .70,
         .72, .70, .60, .58, .62, .75, .92, 1.0, .98, .85, .60, .40],
        [.90, 1.0, 1.0, .98, .88, .80, .82],
    ),
}  # fmt: skip

# When each kind of audience is around, by their local hour (all days). A heuristic: it
# reshapes the platform curve, so developers' lunch and late evenings count for more.
AUDIENCES = {
    "developers": [.30, .25, .20, .20, .20, .25, .40, .70, .70, .90, .90, .90,
                   1.0, 1.0, .85, .85, .85, .90, .90, .90, 1.0, 1.0, 1.0, .70],
    "business":   [.20, .15, .15, .15, .20, .40, 1.0, 1.0, 1.0, .90, .90, .90,
                   1.0, 1.0, .80, .80, .80, .90, .90, .60, .60, .60, .40, .25],
    "students":   [.60, .60, .20, .20, .20, .20, .20, .20, .50, .50, .90, .90,
                   .90, .90, .80, .80, .80, .80, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0],
    "creatives":  [.30, .30, .30, .30, .30, .30, .30, .60, .60, .60, .90, .90,
                   .90, .80, .80, .80, .80, .80, .80, 1.0, 1.0, 1.0, 1.0, 1.0],
}  # fmt: skip


def upgrade() -> None:
    # Shared seed data, not user-owned: no user_id and no RLS (like platform_profiles).
    curves = op.create_table(
        "posting_curves",
        sa.Column("id", sa.Integer(), sa.Identity(), nullable=False),
        sa.Column("platform", sa.String(length=16), nullable=False),  # x, linkedin, telegram, any
        sa.Column("audience", sa.String(length=16), nullable=False),  # general or a profession
        sa.Column("weekday", sa.SmallInteger(), nullable=True),  # 0 = Monday; NULL = every day
        sa.Column("hours", postgresql.ARRAY(sa.Float()), nullable=False),  # 24 local hours
        sa.Column("source", sa.Text(), nullable=False),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint("cardinality(hours) = 24", name=op.f("ck_posting_curves_24_hours")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_posting_curves")),
        sa.UniqueConstraint(
            "platform",
            "audience",
            "weekday",
            name=op.f("uq_posting_curves_key"),
            postgresql_nulls_not_distinct=True,
        ),  # fmt: skip
    )
    rows = []
    for platform, (source, hours, days) in STUDIES.items():
        for weekday, factor in enumerate(days):
            rows.append(
                {
                    "platform": platform,
                    "audience": "general",
                    "weekday": weekday,
                    "hours": [round(h * factor, 3) for h in hours],
                    "source": source,
                }
            )
    for audience, hours in AUDIENCES.items():
        rows.append(
            {
                "platform": "any",
                "audience": audience,
                "weekday": None,
                "hours": hours,
                "source": "Voxlace heuristic: when this audience is usually free to read",
            }
        )
    op.bulk_insert(curves, rows)

    # Who each platform's audience is and where it lives (FR-33), what the user wants from
    # it, and the Telegram channel name for the hand-off (FR-12).
    op.add_column(
        "platform_settings",
        sa.Column(
            "audience_places", postgresql.JSONB(), server_default="[]", nullable=False
        ),  # [{"timezone": "Africa/Addis_Ababa", "share": 70}, …]
    )
    op.add_column(
        "platform_settings",
        sa.Column(
            "audience_profession", sa.String(length=16), server_default="general", nullable=False
        ),
    )
    op.add_column(
        "platform_settings", sa.Column("goal", sa.Text(), server_default="", nullable=False)
    )
    op.add_column("platform_settings", sa.Column("posts_per_week", sa.SmallInteger()))
    op.add_column("platform_settings", sa.Column("channel", sa.String(length=64)))

    # The hours the user can post, on their own clock: every hand-off needs them awake.
    op.add_column(
        "profiles",
        sa.Column("post_window_start", sa.Time(), server_default="08:00", nullable=False),
    )
    op.add_column(
        "profiles", sa.Column("post_window_end", sa.Time(), server_default="22:00", nullable=False)
    )


def downgrade() -> None:
    op.drop_column("profiles", "post_window_end")
    op.drop_column("profiles", "post_window_start")
    for column in ("channel", "posts_per_week", "goal", "audience_profession", "audience_places"):
        op.drop_column("platform_settings", column)
    op.drop_table("posting_curves")
