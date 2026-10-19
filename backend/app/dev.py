"""Developer commands for Phase 1, before the API and login exist.

    python -m app.dev import-telegram path/to/result.json
    python -m app.dev embed [--limit 1000]
    python -m app.dev search "a topic" [--platform telegram]
    python -m app.dev draft "today's check-in" [--platform telegram] [--show-prompt]
    python -m app.dev eval [--platform telegram]   # the ten test topics

Everything is stored under one fixed dev user, the same way real users will be.
"""

import argparse
import secrets
from pathlib import Path

from sqlalchemy.dialects.postgresql import insert

from app.core.auth import DEV_USER_ID
from app.core.db import user_session
from app.evals import run_eval
from app.importers.telegram import parse_telegram
from app.models import Import, Invite, User
from app.services.drafting import DraftError, generate_draft, prompt_for
from app.services.embedding import DEFAULT_LIMIT, embed_pending
from app.services.posts import save_posts
from app.services.retrieval import find_examples


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


def evaluate(platform: str) -> None:
    path = run_eval(DEV_USER_ID, platform)
    print(path.read_text(encoding="utf-8").splitlines()[2])
    print(f"report: {path}")


def make_invite(email: str | None) -> None:
    """FR-28: an invite code for one tester (bound to their email if given)."""
    code = f"VX-{secrets.token_hex(3).upper()}-{secrets.token_hex(3).upper()}"
    with user_session(DEV_USER_ID) as s:  # invites have no RLS; any session can add one
        s.add(Invite(code=code, email=email.lower() if email else None))
    print(f"invite code: {code}" + (f" (only for {email})" if email else ""))


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
    ev = sub.add_parser("eval", help="draft the ten test topics and write a report")
    ev.add_argument("--platform", default="telegram", choices=["telegram", "x", "linkedin"])
    inv = sub.add_parser("invite", help="create an invite code for a tester")
    inv.add_argument("--email", help="only this email can use the code")
    args = parser.parse_args()
    if args.command == "import-telegram":
        import_telegram(args.path)
    elif args.command == "embed":
        embed(args.limit)
    elif args.command == "search":
        search(args.topic, args.platform)
    elif args.command == "draft":
        draft(args.topic, args.platform, args.show_prompt)
    elif args.command == "eval":
        evaluate(args.platform)
    elif args.command == "invite":
        make_invite(args.email)


if __name__ == "__main__":
    main()
