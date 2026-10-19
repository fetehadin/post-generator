---
name: design-screen
description: Design and build one UI screen or component for Voxlace using docs/DESIGN.md, with a plan approval step, screenshot checks and an independent design review.
argument-hint: [screen or component, e.g. "draft editor"]
disable-model-invocation: true
---

Design and build: $ARGUMENTS

1. **Read first.** `docs/DESIGN.md` (principles, the screen's spec in §4, tokens in §5, states in §7, copy rules in §8, accessibility in §9), the requirements it cites in `docs/SRS.md`, and the endpoints in `docs/API.md`. If the screen belongs to a later phase than `CLAUDE.md`'s "Current phase", say so and stop.
2. **Brief (stop for approval).** Reply with:
   - the screen's job in one sentence, and its primary action
   - an ASCII wireframe at desktop width, plus what changes below 768px
   - every state: loading, empty, error, over-limit, success
   - the components from DESIGN.md §6 it uses, and any new one it needs
   - the exact button and message copy
   - anything in the brief that conflicts with DESIGN.md or the SRS
3. **Build against mocks.** Use `src/api/mocks` matching `docs/API.md` and real text from `samples/`. Only tokens from DESIGN.md §5: no hard-coded colors, sizes or fonts.
4. **Screenshot.** Start the dev server with `VITE_USE_MOCKS=true`, then capture the screen at 1280×800 and 390×844, in light and dark, saving to `frontend/screenshots/<screen>-<width>-<theme>.png` (git-ignored). Use the project's screenshot script if one exists, otherwise (run `npx playwright install chromium` once per machine first):
   `npx playwright screenshot --viewport-size=1280,800 --color-scheme=dark http://localhost:5173/<route> frontend/screenshots/<file>.png`
   Read each image and compare it against your brief. List the differences and fix them.
5. **Independent review.** Ask the `design-reviewer` subagent to review the screenshots and the changed files against DESIGN.md §12. Fix every must-fix item, then re-screenshot.
6. **Check.** Run `/check` for the frontend.
7. **Report:** what you built, requirement ids, the screenshots' paths, the reviewer's verdict, open questions, and a short teaching note on any new pattern used.
