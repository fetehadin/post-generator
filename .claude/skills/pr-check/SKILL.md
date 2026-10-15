---
name: pr-check
description: Review the current branch against main like the teammate would, using the CONTRIBUTING review checklist, before opening a pull request.
disable-model-invocation: true
---

Review the changes on this branch compared with `main` (`git diff main...HEAD` and `git log main..HEAD`).

Check, in this order, and quote file:line for every finding:

1. **Does it do what it claims?** Compare with the issue's "done when" and the SRS ids in the commits.
2. **User isolation.** Any query without a `user_id` filter, any route without `get_current_user`, any `user_id` taken from the request body, any new user-owned table without an RLS policy.
3. **Secrets and personal data** in the diff, logs or test fixtures.
4. **Rules in `CLAUDE.md`:** AI calls outside `app/ai/client.py`, hard-coded model names, plain `len()` for X length, naive datetimes, publishing without approval.
5. **Tests:** missing tests for new logic, especially parsers, counters, retrieval and auth.
6. **Contract:** endpoint changes without a matching `docs/API.md` change.
7. **Readability:** names, function size, dead code.

Output: a verdict (ready / needs changes), then findings grouped as **must fix**, **should fix**, **nice to have**. Then draft the PR description using `.github/PULL_REQUEST_TEMPLATE.md`. Don't push or open the PR unless asked.
