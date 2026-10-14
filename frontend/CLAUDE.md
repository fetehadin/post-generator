# Frontend (React)

React + Vite + TypeScript · React Router · TanStack Query · Tailwind CSS · FullCalendar · Supabase JS (login only) · Vitest + Testing Library · ESLint + Prettier.

## Layout

```
frontend/src/
├── main.tsx            Router, QueryClient, auth provider
├── api/
│   ├── client.ts       fetch wrapper: base URL, bearer token, error shape → ApiError
│   ├── types.ts        Generated from the backend OpenAPI (don't edit by hand)
│   ├── mocks/          Fake responses matching docs/API.md, used when VITE_USE_MOCKS=true
│   └── *.ts            One file per resource: imports.ts, drafts.ts … (TanStack Query hooks)
├── pages/              One folder per screen: Upload, Generate, Onboarding, Settings, ChatBoard, Drafts, Calendar
├── components/         Shared UI: DraftCard, LengthCounter, PlatformBadge, AiLabel …
├── lib/                auth.ts, time.ts (UTC ↔ local), handoff.ts (X link, LinkedIn copy)
└── test/               Test setup
```

## Commands

```bash
npm install
npm run dev                 # :5173, proxies /api to :8000
npm run gen:api             # regenerate src/api/types.ts from http://localhost:8000/openapi.json
npm run lint && npm test && npm run build
VITE_USE_MOCKS=true npm run dev   # build screens before the endpoint exists
```

## Conventions

- **TypeScript strict.** No `any`; use the generated API types.
- **Function components and hooks only.** Components stay small; data fetching lives in `api/*` hooks, not in components.
- **Server state = TanStack Query.** Don't copy server data into `useState`. Invalidate queries after mutations.
- **Contract first.** Build against `api/mocks` that match `docs/API.md`, then switch to the real API. If the real response differs from the doc, fix one of them; don't patch around it in the UI.
- **Errors:** show `error.message` from the API error shape. On 429 or 503 keep the user's input in the form.
- **Styling:** Tailwind utility classes. No inline style objects except for dynamic values.
- **Accessibility:** real `<button>`s and `<label>`s, visible focus, keyboard-usable calendar actions.

## Product rules the UI must enforce

- Every draft shows an **AI-generated** label and its status (draft, approved, published, discarded).
- **Length counter** uses the platform rule from the API (`length.count`, `length.limit`). Copy, approve and publish are disabled when over the limit. X counting is weighted; never compute it with `.length`.
- **Nothing is published without a click.** Telegram "Publish now" and scheduling both require the draft to be approved first.
- **Times:** the API sends UTC. Display in the user's time zone with `Intl.DateTimeFormat`; send UTC back.
- **Hand-off:** X opens `https://x.com/intent/tweet?text=` with encoded text; LinkedIn copies to the clipboard, then opens the composer and confirms "Copied".
- **Uploads:** blocked until the privacy notice is accepted. Show parsed counts and skipped reasons after import.

## Auth

- Supabase JS handles sign-in and session refresh. Get the access token from the session and send it as `Authorization: Bearer`.
- Don't store tokens yourself in `localStorage`. Don't put any secret in `VITE_*` variables; they ship to the browser.

## Tests

- Vitest + Testing Library for components with logic: `LengthCounter`, `DraftCard` actions, the calendar's time conversion, hand-off URL building.
- Mock the API layer, not `fetch` internals.
