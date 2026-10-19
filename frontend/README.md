# Frontend

React + Vite + TypeScript, with React Router, TanStack Query and Tailwind CSS.

## Run it

```bash
nvm use            # or any Node 22+; .nvmrc says 24
npm install
npm run dev        # http://localhost:5173 — /api is forwarded to the API on :8000
```

Start the API first (`cd backend && uvicorn app.main:app --reload`). Pages so far:

- `/import`: upload a Telegram export, see what was found and skipped, and watch the voice being learned (Phase 1).
- `/status`: **API: ok, Database: ok** (the Phase 0 demo). Also in the avatar menu.
- Today, Drafts, Calendar and Voice are placeholders until their features are decided (`docs/SCREEN_FEATURES.md`).

**No backend?** `VITE_USE_MOCKS=true npm run dev` answers like the real API (`src/api/mocks/handlers.ts`, shapes from `docs/API.md`).

## Checks

```bash
npm run lint       # oxlint + Prettier check
npm test           # Vitest (add -- --run for a single run, as CI does)
npm run build      # type-check + production build
npm run format     # fix formatting
```

## Where things go

`src/api/` talks to the backend (`client.ts` turns the API's error shape into `ApiError`). `src/pages/` has one folder per screen. Colors, radius and fonts are **design tokens** in `src/index.css`, taken from `docs/DESIGN.md` §5. Use `text-ink`, `bg-surface`, `border-line` and so on, never raw hex.

Screens, in build order: Upload → Generate → Login → Onboarding → Settings → Chat board → Draft editor → Library → Calendar.

Working rules for humans and Claude: [`CLAUDE.md`](CLAUDE.md).
