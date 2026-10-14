---
name: migration
description: Create and review an Alembic migration for a schema change, including RLS policies and pgvector columns.
argument-hint: [what the migration does]
disable-model-invocation: true
---

Create a migration for: $ARGUMENTS

1. Update or add the SQLAlchemy models in `backend/app/models/`.
2. From `backend/`, run `alembic revision --autogenerate -m "<short description>"`.
3. Open the generated file and fix it:
   - `Vector(768)` columns import from `pgvector.sqlalchemy`.
   - New user-owned tables have `user_id` (FK, indexed), `created_at timestamptz`, and in `upgrade()`:
     `ALTER TABLE … ENABLE ROW LEVEL SECURITY;` plus a policy `USING (user_id = current_setting('app.user_id')::uuid)`.
   - Unique constraints the SRS needs (for example `(user_id, platform, external_id)` on `source_posts`).
   - `downgrade()` actually reverses `upgrade()`.
   - No data is dropped or renamed without the user's explicit approval.
4. Run `alembic upgrade head`, then `alembic downgrade -1` and `alembic upgrade head` again to prove it reverses (ask before the downgrade if the database holds real data).
5. Run `pytest -q`.
6. Show the final migration file and explain each operation in one line.
