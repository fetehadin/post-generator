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

SEED = {
    "x": [
        (
            "launch",
            "It's live.\n\nA tiny tool that turns your messy meeting notes into a clean list "
            "of decisions and owners.\n\nBuilt it in two weekends because I kept losing track "
            "of who said they'd do what.\n\nTry it and tell me what breaks.",
        ),
        (
            "progress",
            "Day 12 of building in public:\n\n- login works\n- payments half work\n- my "
            "tests finally pass on the first try\n\nTomorrow: the boring part nobody sees, "
            "error messages people can actually read.",
        ),
        (
            "lesson",
            "Spent 3 hours chasing a bug.\n\nThe fix was one line: a time stored without a "
            "time zone.\n\nLesson I keep relearning: store UTC, convert only when you show it.",
        ),
        (
            "opinion",
            "Unpopular opinion: your first version should embarrass you a little.\n\nIf it "
            "doesn't, you waited too long to ship it.",
        ),
        (
            "tip",
            "Small habit that saved me hours this month:\n\nBefore I start a task, I write "
            "one line: \"Done when…\"\n\nIf I can't finish that sentence, I'm not ready to "
            "code yet.",
        ),
        (
            "humor",
            "Me: I'll just fix this one small thing.\n\nAlso me, four hours later: rewriting "
            "the database layer.",
        ),
        (
            "event",
            "Speaking at the local dev meetup on Thursday.\n\nTopic: what broke when we put "
            "our side project in front of real users, and what we changed.\n\nCome say hi.",
        ),
        (
            "question",
            "Builders: how do you decide when a feature is done?\n\nI keep polishing and "
            "never ship. Looking for a rule that actually works.",
        ),
    ],
    "linkedin": [
        (
            "launch",
            "After three months of evenings and weekends, we launched today.\n\nThe problem "
            "was simple: small shops lose orders because their messages are scattered across "
            "three apps.\n\nWhat we built:\n→ one inbox for every order\n→ a reminder when an "
            "order waits too long\n→ a weekly summary the owner can read in a minute\n\nWhat "
            "I learned: talk to five real users before writing the first line of code. Every "
            "feature we cut came from those conversations.\n\nIf you run a small business, "
            "I'd love your honest feedback.",
        ),
        (
            "progress",
            "A month ago our app took 9 seconds to load. Today it takes under 2.\n\nNo big "
            "rewrite. Three small changes:\n\n1. We stopped loading data the first screen "
            "doesn't show.\n2. We cached the one query everyone runs.\n3. We made images the "
            "right size before sending them.\n\nThe biggest win wasn't technical. It was "
            "measuring first, so we stopped guessing.",
        ),
        (
            "lesson",
            "The most expensive bug I ever shipped wasn't in the code.\n\nIt was in the "
            "requirements. We built exactly what was written, and it wasn't what the user "
            'needed.\n\nSince then, I ask one question before every feature: "What will '
            "you do differently once this exists?\"\n\nIf nobody can answer, we don't build "
            "it yet.",
        ),
        (
            "opinion",
            "Junior developers don't need to know everything. They need to know how to find "
            "out.\n\nThe best engineers I've worked with weren't the ones with all the "
            "answers. They were the ones who asked good questions early, wrote down what they "
            "learned, and weren't afraid to say \"I don't know yet.\"\n\nWhat's a question "
            "that changed how you work?",
        ),
        (
            "tip",
            "Writing a good pull request description takes five minutes and saves your "
            "reviewer thirty.\n\nMine always answer three things:\n• What changed\n• Why it "
            "changed\n• How I tested it\n\nThat's it. Reviews got faster and kinder the week "
            "our team started doing this.",
        ),
        (
            "event",
            "I'm hosting a free workshop next Saturday for people starting out in backend "
            "development.\n\nWe'll build a small API together, add a database, and deploy "
            "it, all in two hours.\n\nNo experience with servers needed. Bring a laptop and "
            "your questions. Link in the comments.",
        ),
        (
            "humor",
            "My code review checklist, honestly:\n\n1. Does it work?\n2. Do I understand "
            "it?\n3. Will I understand it in six months?\n\nNumber 3 has rejected more of my "
            "own code than anyone else's.",
        ),
        (
            "milestone",
            "One year ago I wrote my first line of Python.\n\nToday I merged my first "
            "pull request into a project used by thousands of people.\n\nNot because I'm "
            "special. Because I showed up most days, asked for help when stuck, and kept "
            "shipping small things.\n\nIf you're at day one, keep going.",
        ),
    ],
    "telegram": [
        (
            "launch",
            "🚀 New in the app today: dark mode.\n\nYou asked for it a lot, so here it is. "
            "It follows your phone's setting, or you can switch it in Settings.\n\nTell me "
            "if anything looks wrong.",
        ),
        (
            "progress",
            "This week's update:\n\n✅ Faster search\n✅ Fixed the bug where photos uploaded "
            "twice\n🔧 Working on: offline mode\n\nThanks to everyone who reported issues. "
            "Keep them coming.",
        ),
        (
            "lesson",
            "Quick lesson from today:\n\nI deleted a production table by accident. We had a "
            "backup from last night, so we lost only a few hours.\n\nIf you take one thing "
            "from this: test your backups. A backup you've never restored is only a hope.",
        ),
        (
            "tip",
            "Tip of the day 💡\n\nWhen an error message confuses you, copy it exactly into "
            "your search. Not your guess of what it means, the exact words.\n\nNine times out "
            "of ten someone has already solved it.",
        ),
        (
            "opinion",
            "Honest thought: most apps don't need more features. They need the features they "
            "have to work every time.\n\nThis month I'm fixing, not adding.",
        ),
        (
            "event",
            "📅 Live Q&A this Friday at 7 PM.\n\nAsk me anything about learning to code, "
            "getting your first job, or the project I'm building. Drop your questions here "
            "before then.",
        ),
        (
            "humor",
            "Wrote the code in 20 minutes.\nNamed the variables in 40.\n\nPriorities. 😅",
        ),
        (
            "resource",
            "Sharing the notes I wish I had when I started with databases:\n\n1. Learn SQL "
            "before any ORM\n2. Every table needs a primary key\n3. Index what you search "
            "by\n4. Back up before you migrate\n\nSave this for later.",
        ),
    ],
}


def upgrade() -> None:
    # Shared, non-personal, like platform_profiles: no user_id, so no RLS.
    table = op.create_table(
        "exemplar_posts",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("platform", sa.String(length=16), nullable=False),
        sa.Column("post_type", sa.String(length=32), nullable=False),
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
            {"platform": platform, "post_type": kind, "text": text}
            for platform, posts in SEED.items()
            for kind, text in posts
        ],
    )


def downgrade() -> None:
    op.drop_table("exemplar_posts")
