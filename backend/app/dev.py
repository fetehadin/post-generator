"""Developer commands for Phase 1, before the API and login exist.

    python -m app.dev import-telegram path/to/result.json
    python -m app.dev embed [--limit 1000]
    python -m app.dev search "a topic" [--platform telegram]
    python -m app.dev draft "today's check-in" [--platform telegram] [--show-prompt]

Everything is stored under one fixed dev user, the same way real users will be.
"""

import argparse
import uuid
from pathlib import Path

from sqlalchemy.dialects.postgresql import insert

from app.core.db import user_session
from app.importers.telegram import parse_telegram
from app.models import Import, User
from app.services.drafting import DraftError, generate_draft, prompt_for
from app.services.embedding import DEFAULT_LIMIT, embed_pending
from app.services.posts import save_posts
from app.services.retrieval import find_examples

DEV_USER_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")


def import_telegram(path: Path) -> None:
    result = parse_telegram(path.read_bytes())
    with user_session(DEV_USER_ID) as s:
        s.execute(
            insert(User)
            .values(id=DEV_USER_ID, email="dev@voxlace.local", name="Dev user")
            .on_conflict_do_nothing()
        )
        imp = Import(
            user_id=DEV_USER_ID,
            platform="telegram",
            status="embedding",
            parsed=len(result.posts),
            skipped=dict(result.skipped),
        )
        s.add(imp)
        s.flush()
        saved = save_posts(s, DEV_USER_ID, "telegram", result.posts, import_id=imp.id)
    print(
        f"{result.source_name}: {len(result.posts)} posts parsed, {saved.new} new, "
        f"{saved.updated} updated, "
        f"skipped {dict(result.skipped)}"
    )


def embed(limit: int) -> None:
    report = embed_pending(DEV_USER_ID, limit=limit)
    print(f"embedded {report.embedded}, still waiting {report.remaining}")
    if report.stopped_reason:
        print(f"stopped early ({report.stopped_reason}); run it again later to continue")


def search(topic: str, platform: str) -> None:
    for i, e in enumerate(find_examples(DEV_USER_ID, platform, topic), 1):
        tag = " [pinned]" if e.pinned else ""
        print(f"{i}. {e.similarity:.3f}{tag}  {' '.join(e.text.split())[:90]}")


def draft(topic: str, platform: str, show_prompt: bool) -> None:
    try:
        r = generate_draft(DEV_USER_ID, platform, topic)
    except DraftError as e:
        raise SystemExit(str(e)) from e
    over = "  OVER THE LIMIT" if r.over_limit else ""
    print(f"--- {platform} draft · {r.length}/{r.char_limit}{over} · {r.model_version} ---")
    print(r.text)
    print(f"--- based on {len(r.examples)} of your posts · draft id {r.draft_id} ---")
    if show_prompt:
        print("\n=== exact prompt ===\n" + prompt_for(DEV_USER_ID, r.draft_id).prompt)


def main() -> None:
    parser = argparse.ArgumentParser(prog="python -m app.dev")
    sub = parser.add_subparsers(dest="command", required=True)
    imp = sub.add_parser("import-telegram", help="import a Telegram channel export")
    imp.add_argument("path", type=Path)
    emb = sub.add_parser("embed", help="embed the dev user's waiting posts, best first")
    emb.add_argument("--limit", type=int, default=DEFAULT_LIMIT)
    src = sub.add_parser("search", help="show the 8 posts the prompt would use for a topic")
    src.add_argument("topic")
    src.add_argument("--platform", default="telegram", choices=["telegram", "x", "linkedin"])
    drf = sub.add_parser("draft", help="write a draft in your voice and save it")
    drf.add_argument("topic")
    drf.add_argument("--platform", default="telegram", choices=["telegram", "x", "linkedin"])
    drf.add_argument("--show-prompt", action="store_true")
    args = parser.parse_args()
    if args.command == "import-telegram":
        import_telegram(args.path)
    elif args.command == "embed":
        embed(args.limit)
    elif args.command == "search":
        search(args.topic, args.platform)
    elif args.command == "draft":
        draft(args.topic, args.platform, args.show_prompt)


if __name__ == "__main__":
    main()
