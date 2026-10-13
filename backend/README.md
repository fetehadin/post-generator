# Backend

FastAPI app. Scaffolded in **Phase 0** — see [`docs/BUILD_PLAN.md`](../docs/BUILD_PLAN.md#phase-0--foundations).

Planned layout:

```text
backend/
├── app/
│   ├── main.py         FastAPI app and router registration
│   ├── api/            Route handlers (imports, posts, drafts, …)
│   ├── ai/             client.py (embed, generate, fallback chain), prompts/
│   ├── importers/      telegram.py, x.py, linkedin.py
│   ├── models/         SQLAlchemy models
│   └── core/           config.py, db.py, auth.py
├── migrations/         Alembic
├── tests/
└── pyproject.toml      Dependencies, Ruff and pytest config
```

Rule: every call to an AI provider goes through `app/ai/client.py`. Nothing else imports a provider SDK.
