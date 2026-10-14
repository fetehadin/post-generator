---
name: slice
description: Plan and build one end-to-end slice (DB → API → UI) from an issue or a one-line goal, following the build plan and SRS.
argument-hint: [issue number or goal]
disable-model-invocation: true
---

Build this slice: $ARGUMENTS

Work in this order and stop for approval where marked.

1. **Understand.** If an issue number was given, read it with `gh issue view`. Find the matching FR-/NFR- ids in `docs/SRS.md` and the phase in `docs/BUILD_PLAN.md`. If it belongs to a later phase than the "Current phase" in `CLAUDE.md`, say so and stop.
2. **Plan (stop for approval).** Reply with:
   - the "done when" check in one sentence
   - schema changes (tables, columns, RLS policy)
   - endpoint changes as they'll appear in `docs/API.md`
   - files to create or change, backend and frontend
   - tests you'll add
   - anything that needs a decision
3. **Branch.** `git switch -c feat/<short-name>` from an up-to-date `main`.
4. **Contract.** Update `docs/API.md`, then the Pydantic schemas, then the frontend mocks.
5. **Backend.** Migration (review the generated file), models, service, router, tests including the two-user isolation test.
6. **Frontend.** Hook in `src/api/`, then the screen, built against the mocks, then switched to the real API.
7. **Check.** Run the `/check` steps for everything touched and fix failures.
8. **Commit** in small steps: `type(scope): what (FR-x)`.
9. **Report:** what changed, requirement ids, how to demo it on real data, open questions, and a short teaching note on any new concept used.
