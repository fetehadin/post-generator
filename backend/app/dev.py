"""Developer commands for Phase 1, before the API and login exist.

    python -m app.dev import-telegram path/to/result.json

Everything is stored under one fixed dev user, the same way real users will be.
"""

import argparse
import uuid
from pathlib import Path

from sqlalchemy.dialects.postgresql import insert

from app.core.db import user_session
from app.importers.telegram import parse_telegram
from app.models import Import, User
from app.services.posts import save_posts

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
        new = save_posts(s, DEV_USER_ID, "telegram", result.posts, import_id=imp.id)
    print(
        f"{result.source_name}: {len(result.posts)} posts parsed, {new} new, "
        f"skipped {dict(result.skipped)}"
    )


def main() -> None:
    parser = argparse.ArgumentParser(prog="python -m app.dev")
    sub = parser.add_subparsers(dest="command", required=True)
    imp = sub.add_parser("import-telegram", help="import a Telegram channel export")
    imp.add_argument("path", type=Path)
    args = parser.parse_args()
    if args.command == "import-telegram":
        import_telegram(args.path)


if __name__ == "__main__":
    main()
