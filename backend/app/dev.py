"""Developer commands for Phase 1, before the API and login exist.

    python -m app.dev import-telegram path/to/result.json
    python -m app.dev embed [--limit 1000]
    python -m app.dev search "a topic" [--platform telegram]
    python -m app.dev draft "today's check-in" [--platform telegram] [--show-prompt]
    python -m app.dev eval [--platform telegram]   # the ten test topics
    python -m app.dev amharic-eval [--cases FILE]   # FR-56 blind test: drafts + sheet
    python -m app.dev amharic-score RUN_DIR SHEET.csv [SHEET.csv ...]   # names the winner
    python -m app.dev check-models                  # one tiny prompt per model (daily cron)
    python -m app.dev ai-report [--days 7]          # AI calls per day and purpose (as owner)
    python -m app.dev new-secret-key                # a key for AI_KEY_ENCRYPTION_KEYS
    python -m app.dev import-inspiration DIR        # creators' posts, for structure only
    python -m app.dev backfill-inspiration          # tag with the free LLM, embed locally

Everything is stored under one fixed dev user, the same way real users will be.
"""

import argparse
import secrets
from pathlib import Path

from sqlalchemy.dialects.postgresql import insert

from app import amharic_eval
from app.ai.client import default_client
from app.core.auth import DEV_USER_ID
from app.core.config import get_settings
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


def amharic_run(cases_path: Path) -> None:
    if not cases_path.exists():
        raise SystemExit(
            f"No cases file at {cases_path}. Copy samples/amharic_eval_cases.example.json there "
            "and write your 25 cases (10 amharic, 10 mixed, 5 rewrite)."
        )
    out = amharic_eval.run(DEV_USER_ID, amharic_eval.load_cases(cases_path), cases_path.parent)
    print(f"done: {out}")
    print("Each judge copies sheet.csv, reads drafts.md and scores 1-5; don't open key.json.")


def check_models() -> None:
    """Daily health check of each model in the chain. Exits 1 when any model fails, so cron
    and the log show it before the fallback quietly carries every draft."""
    checks = default_client().check_models()
    for c in checks:
        print(f"{c.provider}:{c.model} {'ok' if c.error is None else 'FAILED ' + c.error}")
    if any(c.error for c in checks):
        raise SystemExit(1)


AI_REPORT = """
SELECT created_at::date AS day, purpose, coalesce(key_source, '-') AS key,
       count(*) AS calls,
       round(100.0 * avg(ok::int)) AS ok_pct,
       round(avg(latency_ms) FILTER (WHERE ok)) AS avg_ms,
       percentile_disc(0.95) WITHIN GROUP (ORDER BY latency_ms) AS p95_ms,
       round(avg(attempts), 1) AS attempts,
       coalesce(sum(prompt_tokens), 0) AS tokens_in,
       coalesce(sum(output_tokens), 0) AS tokens_out,
       coalesce(sum(thinking_tokens), 0) AS thinking,
       count(DISTINCT user_id) AS users
FROM ai_calls
WHERE created_at > now() - make_interval(days => :days)
GROUP BY 1, 2, 3 ORDER BY 1 DESC, 4 DESC
"""


def ai_report(days: int) -> None:
    """Numbers only, never text (NFR-20). Runs as the table owner, because row-level security
    rightly hides every user's calls from the app's own role."""
    from sqlalchemy import create_engine, text

    engine = create_engine(get_settings().migrations_database_url)
    with engine.connect() as conn:
        rows = conn.execute(text(AI_REPORT), {"days": days}).mappings().all()
    if not rows:
        print(f"No AI calls in the last {days} days.")
        return
    cols = list(rows[0].keys())
    widths = {c: max(len(c), *(len(str(r[c])) for r in rows)) for c in cols}
    print("  ".join(c.ljust(widths[c]) for c in cols))
    for r in rows:
        print("  ".join(str(r[c]).ljust(widths[c]) for c in cols))


def import_inspiration(folder: Path, per_author: int) -> None:
    """FR-41: creators' posts into the shared pool, for their structure only. Reads
    {x,linkedin}/clean/<author>.json (lists of {"text": …}) and telegram/<channel>/result.json.
    The files are other people's posts: they stay out of git (samples/private/)."""
    import json

    from app.importers.telegram import parse_telegram
    from app.services.inspiration import NewPost, add_posts, best_per_author

    posts: list[NewPost] = []
    for platform in ("x", "linkedin"):
        for f in sorted((folder / platform / "clean").glob("*.json")):
            for item in json.loads(f.read_text()):
                if str(item.get("suspicious", "False")).lower() == "true":
                    continue  # the cleaner wasn't sure the author wrote it
                likes = str(item.get("reactions") or item.get("likes") or "0").replace(",", "")
                reactions = int(likes) if likes.isdigit() else 0
                posts.append(NewPost(platform, f.stem, item.get("text") or "", reactions))
    for export in sorted((folder / "telegram").glob("*/result.json")):
        parsed = parse_telegram(export.read_bytes())
        author = parsed.source_name or export.parent.name
        posts += [NewPost("telegram", author, p.text, p.reactions) for p in parsed.posts]
    chosen = best_per_author(posts, per_author)
    added = add_posts(chosen)
    print(
        f"Read {len(posts)} posts; kept the best {len(chosen)} (up to {per_author} per author); "
        f"{added} new in the pool."
    )


def backfill_inspiration(tag_batch: int, pause: float, skip_tagging: bool) -> None:
    from app.services.inspiration import embed_pending, tag_pending

    if not skip_tagging:
        report = tag_pending(batch=tag_batch, pause=pause)
        print(f"Tagged {report.tagged}; {report.remaining} still untagged.")
        if report.stopped_reason:
            print(f"Stopped early ({report.stopped_reason}). Run again later to continue.")
    embedded = embed_pending()
    print(f"Embedded {embedded.embedded} posts with the local model.")


def new_secret_key() -> None:
    from app.core.secrets import new_key

    print(new_key())


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
    am = sub.add_parser("amharic-eval", help="FR-56 blind test: every candidate drafts each case")
    am.add_argument("--cases", type=Path, default=amharic_eval.CASES)
    sc = sub.add_parser("amharic-score", help="average the judges' sheets and name the winner")
    sc.add_argument("run_dir", type=Path)
    sc.add_argument("sheets", type=Path, nargs="+")
    sub.add_parser("check-models", help="send one tiny prompt to each model in the chain")
    rep = sub.add_parser("ai-report", help="AI calls per day, purpose and key (numbers only)")
    rep.add_argument("--days", type=int, default=7)
    sub.add_parser("new-secret-key", help="print a new key for AI_KEY_ENCRYPTION_KEYS")
    ins = sub.add_parser("import-inspiration", help="creators' posts into the pool (structure)")
    ins.add_argument("folder", type=Path)
    ins.add_argument("--per-author", type=int, default=40)
    bf = sub.add_parser("backfill-inspiration", help="tag (free LLM) and embed (local) the pool")
    bf.add_argument("--tag-batch", type=int, default=8)
    bf.add_argument("--pause", type=float, default=2.0, help="seconds between LLM calls")
    bf.add_argument("--skip-tagging", action="store_true")
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
    elif args.command == "amharic-eval":
        amharic_run(args.cases)
    elif args.command == "amharic-score":
        print(amharic_eval.report(args.run_dir, args.sheets))
    elif args.command == "check-models":
        check_models()
    elif args.command == "ai-report":
        ai_report(args.days)
    elif args.command == "new-secret-key":
        new_secret_key()
    elif args.command == "import-inspiration":
        import_inspiration(args.folder, args.per_author)
    elif args.command == "backfill-inspiration":
        backfill_inspiration(args.tag_batch, args.pause, args.skip_tagging)
    elif args.command == "invite":
        make_invite(args.email)


if __name__ == "__main__":
    main()
