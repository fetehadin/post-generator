# Frontend

React + Vite + TypeScript, with React Router, TanStack Query and Tailwind CSS.

## Run it

```bash
nvm use            # or any Node 22+; .nvmrc says 24
npm install
npm run dev        # http://localhost:5173 — /api is forwarded to the API on :8000
```

Start the API first (`cd backend && uvicorn app.main:app --reload`). The home page shows **API: ok, Database: ok** (the Phase 0 demo).

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
