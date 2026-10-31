"""exemplar posts: a shared inspiration pool per platform for thin histories (FR-5, Phase 3)

Revision ID: 0010
Revises: 0009
Create Date: 2026-11-01 10:00:00

Written for Voxlace by the team, not taken from any real person's posts and not from any
user's export. Drafts use them for structure only (hook, line breaks, length, ending) when
a user has fewer than 20 posts on a platform; voice and facts never come from here.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0010"
down_revision: str | None = "0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Templates, not stories: every specific is a [slot] the draft fills from the user's own facts
# or leaves out. No numbers, days, offers or calls to action, so nothing here can turn into a
# fact in someone's draft (rule 10). Order within a platform is the order shown to the model.
SEED = {
    "x": [
        (
            "launch",
            "[What you built] is live.\n\nIt [does the one thing it does].\n\nI made "
            "it because [the problem you kept hitting].",
        ),
        (
            "progress",
            "Building [project] in public:\n\n- [done]\n- [done]\n- [in progress]"
            "\n\nNext: [the next step].",
        ),
        (
            "lesson",
            "Spent the day chasing a bug.\n\nThe cause: [the cause].\n\nThe lesson I "
            "keep relearning: [the lesson].",
        ),
        ("opinion", "Unpopular opinion: [your opinion].\n\n[One line on why]."),
        (
            "tip",
            "A small habit that saves me time:\n\n[the habit].\n\n[Why it works, in one line].",
        ),
        (
            "humor",
            "Me: I'll just fix [one small thing].\n\nAlso me, much later: [the much "
            "bigger thing I ended up doing].",
        ),
        (
            "question",
            "A question for people who [do what you do]:\n\nHow do you [the thing "
            "you're unsure about]?",
        ),
        ("milestone", "[The milestone].\n\nWhat got me here: [the one thing that mattered most]."),
    ],
    "linkedin": [
        (
            "launch",
            "Today I'm sharing [what you built].\n\nThe problem: [the problem, in "
            "plain words].\n\nWhat it does:\n→ [first thing]\n→ [second thing]\n→ [third "
            "thing]\n\nWhat I learned building it: [the lesson].",
        ),
        (
            "progress",
            "Where [project] stands now: [the result].\n\nWhat changed:\n\n1. "
            "[change]\n2. [change]\n3. [change]\n\nThe biggest win wasn't technical. It was "
            "[the non-technical win].",
        ),
        (
            "lesson",
            "The most expensive mistake I made on [project] wasn't in the code.\n\nIt "
            "was [the real mistake].\n\nSince then, before every [task], I ask: [the question].",
        ),
        (
            "opinion",
            "[A belief about your field] is overrated.\n\n[What matters more], "
            "because [the reason].\n\nThe people I've learned the most from [did what].",
        ),
        (
            "tip",
            "[A task] takes a few minutes and saves [who] a lot of time.\n\nMine always "
            "covers:\n• [point]\n• [point]\n• [point]\n\nThat's it.",
        ),
        (
            "story",
            "When I started [what you started], I [what you didn't know or couldn't do]."
            "\n\nNow [where you are].\n\nWhat changed: [the habit or decision behind it].",
        ),
        (
            "humor",
            "My honest checklist for [a task]:\n\n1. [question]\n2. [question]\n3. "
            "[the question that catches me out]\n\n[A wry line about the third one].",
        ),
        (
            "milestone",
            "[The milestone].\n\nNot because [the flattering reason]. Because "
            "[the real reason].\n\nIf you're [where you were then], [one line of honest "
            "encouragement].",
        ),
    ],
    "telegram": [
        ("launch", "New: [the feature or project].\n\n[What it does, in one or two lines]."),
        ("progress", "Update on [project]:\n\n✅ [done]\n✅ [done]\n🔧 Working on: [next]"),
        (
            "lesson",
            "A lesson from today:\n\n[what happened, briefly].\n\nThe takeaway: [the lesson].",
        ),
        ("tip", "Tip: [the tip].\n\n[Why it helps, in one line]."),
        ("opinion", "An honest thought: [the opinion].\n\n[What you're doing about it]."),
        (
            "humor",
            "[Thing that should take a minute]: done fast.\n[Thing that shouldn't take "
            "long]: took ages.\n\n[A short wry line].",
        ),
        (
            "resource",
            "Notes I wish I'd had when I started [topic]:\n\n1. [note]\n2. [note]\n3. [note]",
        ),
        ("question", "Question for you: [the question]?\n\n[Why you're asking, in one line]."),
    ],
}


def upgrade() -> None:
    # Shared, non-personal, like platform_profiles: no user_id, so no RLS.
    table = op.create_table(
        "exemplar_posts",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("platform", sa.String(length=16), nullable=False),
        sa.Column("post_type", sa.String(length=32), nullable=False),
        sa.Column("position", sa.SmallInteger(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint(
            "platform IN ('telegram', 'x', 'linkedin')", name=op.f("ck_exemplar_posts_platform")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_exemplar_posts")),
    )
    op.create_index("ix_exemplar_posts_platform", "exemplar_posts", ["platform"])
    op.bulk_insert(
        table,
        [
            {"platform": platform, "post_type": kind, "position": i, "text": text}
            for platform, posts in SEED.items()
            for i, (kind, text) in enumerate(posts, 1)
        ],
    )


def downgrade() -> None:
    op.drop_table("exemplar_posts")
