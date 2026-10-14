# Contributing to Voxlace

Two developers, one repo, one rule: **every change reaches `main` through a pull request the other person approved.**

## Before you start a task

1. Pick an issue from **This week** on the Projects board and assign yourself.
2. Make sure it has a **Done when** line. If not, write one.
3. If it changes the API or the database, agree the shape with your teammate first and update [`docs/API.md`](docs/API.md) in the same PR.

## Branches

```text
feat/<short-name>    new behaviour        feat/telegram-parser
fix/<short-name>     bug fix              fix/x-counter-emoji
chore/<short-name>   tooling, deps, CI    chore/ruff-config
docs/<short-name>    docs only            docs/api-imports
```

Branch from the latest `main`. Keep branches short-lived (a few days at most).

## Commits

Small, present tense, and say why when it isn't obvious:

```text
feat(import): skip Telegram service messages
fix(counter): count URLs as 23 characters on X
chore(ci): run ruff format check
```

## Pull requests

- Under ~400 changed lines. Split bigger work.
- Link the issue (`Closes #12`).
- Fill in the template, including how you tested it.
- Add a screenshot or short clip for UI changes.
- CI must be green before review. The required check is **CI passed** (see [`docs/CI_CD.md`](docs/CI_CD.md)).
- Reviewer responds within one working day. Review before starting new work.
- **Squash merge**, then delete the branch.

## Reviewing

Look for, in order:

1. Does it do what the issue's **Done when** says?
2. Could it leak one user's data to another? (Missing `user_id` filter, missing auth check.)
3. Are secrets, real exports or personal data anywhere in the diff?
4. Are there tests for the logic?
5. Is it readable by the other person in six months?

Ask questions rather than demand changes. Approve when it's good enough to build on, not perfect.

## Definition of done

- [ ] Meets the issue's **Done when**, checked on real data
- [ ] Tests for the logic; CI green
- [ ] Reviewed and approved by the other person
- [ ] No secrets, personal data or real exports committed
- [ ] Docs updated if behaviour, API or schema changed
- [ ] `main` still runs from a fresh clone

## Code style

- **Python:** Ruff for lint and format; type hints on public functions.
- **JavaScript:** Prettier defaults; function components and hooks.
- **SQL:** schema changes only through Alembic migrations.
- **AI calls:** only through `backend/app/ai/client.py`.
- **Times:** store UTC, display local.

## Never commit

- `.env` or any key or token
- Real exports (`tweets.js`, `Shares.csv`, `result.json` from a real account)
- Anything with a real person's email, phone or address
