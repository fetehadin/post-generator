# Reference study: ScholarXIV

What makes [scholarxiv.com](https://www.scholarxiv.com) feel the way it does, and what Voxlace takes from it. **Inspiration, not a clone:** we borrow principles and patterns, never their code, logo, icons, illustrations, copy, or their palette + font combination.

**Sources.**
- `design/scripts/capture-reference.mjs` captured the public pages on 19 Oct 2026: landing, pricing, two developer-docs pages and the logged-out 404. Each page was shot at 1440×900 and 390×844, in light and dark.
- `design/reference/styles.json` holds the computed styles for each page.
- App routes (`/home`, `/chat`, `/paper/…`) return a 404 when you're logged out. The logged-in app comes from four screenshots the team provided: `user-app-home-light.png`, `user-search-dark.png`, `user-search-rail-dark.png` and `user-landing-light.png`.
- All files are in `design/reference/`, which is git-ignored, so the screenshots never enter the repo.
- The site has light and dark only. The brief's "mixed" theme doesn't exist there, so Voxlace defines its own (§5 of DESIGN.md).

---

## 1. Qualities that make it work

### Q1. A monochrome base; color only carries meaning
- **Observed:** the neutrals are cool zinc: `--background 0 0% 100%`, `--foreground 240 10% 3.9%`, `--border 240 5.9% 90%` (#E4E4E7) and `--muted-foreground 240 3.8% 46.1%`. The primary button is near-black (`--primary 240 5.9% 10%`) in light and near-white in dark (`landing-desktop-*.png`, `user-landing-light.png`). Color appears in only a few places: the green "live" dot next to the counters, green links on the 404 page, a green active item in the docs nav (`docs-desktop-light.png`), and the plan colors on pricing.
- **Why it works:** with almost no color on screen, the one colored thing always means something, and the content is the loudest element.
- **Voxlace:** this matches our principle 8, "Calm by default". The user's draft is the hero; our one accent (`--thread`) marks only what the AI drew on (sources, focus, links).

### Q2. A clear type hierarchy, with tight headings and generous reading text
- **Observed:**
  - The landing hero is about 48px and bold, while the body text is 16/24.
  - The docs use a 36px h1 at weight 500 with −0.9px tracking, a 30px h2 at weight 600 with −0.6px, and body text at **16/27.2 (line-height 1.7)** in a column with `max-width 808px` (`docs-desktop-*.png`).
  - Lead paragraphs drop to the muted color (#505351 in light, #8A8D8B in dark).
  - The app uses a single sans (Archivo); the docs use Inter.
- **Why it works:** negative tracking makes big headings read as one shape. A 1.7 line-height and a measure of about 70–80 characters make long text easy to read.
- **Voxlace:** the user's text is long-form reading and editing, so the editor gets the same reading comfort, set in a serif (the user's ink), with headings tight and quiet.

### Q3. Borders and tinted boxes, not shadows
- **Observed:**
  - Controls have a 1px `--border` and a radius of 6px (`nav-item`, buttons) or 8px (docs search).
  - Cards use radius 12px and a 1px border.
  - The side-panel notes are tinted boxes with no shadow (`muted 240 4.8% 95.9%`; `user-app-home-light.png`, right column).
  - `box-shadow` is `none` on every measured element except the floating tabs (`landing-desktop-light.png`, "Discover · Read · Research").
- **Why it works:** flat layers look calm and precise, so a shadow can be kept for things that really float.
- **Voxlace:** this is already our rule (§5: shadows only for menus, dialogs and toasts). We keep it and add a `--sunken` tint for side-panel notes.

### Q4. Three columns: navigation, work, context
- **Observed:** the app has a left nav with an icon + label for each item and a theme toggle in the header. The nav collapses to an icon rail (`user-search-rail-dark.png`). In the middle is a centered work column of about 850px. On the right is a context panel ("Selected papers", "Referenced papers") with helpful empty states written as sentences.
- **Why it works:** the context the AI uses is always visible next to the work, without covering it. The icon rail gives the work room on smaller screens.
- **Voxlace:** this is the draft editor exactly. The left nav is our 5 places. The center is the editor and preview. The right column is **"Based on 8 of your posts"** (principle 2, "Show your sources"), which is visible by default instead of hidden behind a button.

### Q5. Ask first: a centered question and starters
- **Observed:** the empty app home is a single centered question ("What would you like to research about?") with a short muted subtitle and a large rounded input. The input holds an attach icon, a mic icon and a round send button, with a small "Auto" chip below. **Prompt suggestions** are listed underneath as rounded chips (`user-app-home-light.png`).
- **Why it works:** the first action is impossible to miss, and the suggestions solve the blank-page problem.
- **Voxlace:** our Today screen (§4.1) on an empty day becomes "What did you work on today?" with the composer and our prompt starters. Once there are check-ins and drafts, the composer docks to the bottom, the way their search box docks under the results (`user-search-dark.png`).

### Q6. A metadata line before the title
- **Observed:** each result card starts with a row of small icon + text items (date · ID · category · version · source), then the title, the authors, a row of actions (like, Comments, Summary, Download, Save, Notes, Copy), and finally the content in an inset box (`user-search-dark.png`).
- **Why it works:** you can scan the metadata, and the content stays separate from the chrome around it.
- **Voxlace:** each draft card gets a quiet meta line: platform · status · length/limit · version · "8 sources". Then the first lines of the draft in the serif, then **one** primary action (Open). We take the pattern but not the seven-button action row (see §3).

### Q7. Real dark themes, not inverted ones
- **Observed:**
  - Dark mode isn't pure black: the body is `oklch(0.205 0 0)` (#171717) on the landing and #0A0D0D in the docs, and cards are `0 0% 10%`.
  - Primary buttons flip to white with dark text, and borders become `240 3.7% 15.9%`.
  - The theme lives on `<html class="dark">` and is remembered in `localStorage` (`mode-watcher-mode`).
  - The toggle (moon/sun) sits in the sidebar header, always one click away.
- **Why it works:** an off-black background avoids glare and smearing, and flipping the primary button keeps the hierarchy the same in both themes.
- **Voxlace:** a warm off-black instead of their neutral one. Our primary button is **teal** (`--thread`), not a black/white flip; the design review flagged the flip as their identity. The toggle cycles light → dark → mixed, where mixed is a Voxlace-only theme (dark chrome around a light page; see DESIGN.md §5).

### Q8. Quick, restrained motion
- **Observed:** controls transition `color, box-shadow 0.15s cubic-bezier(0.4, 0, 0.2, 1)`, and the docs search transitions `background-color 0.15s`. There are no scroll animations in the app screenshots. The landing page shows a splash loader while it loads (`landing-desktop-dark.png`, first capture).
- **Why it works:** hover and focus feedback feels instant, and nothing moves on its own.
- **Voxlace:** 150ms color transitions only, plus our one signature moment, the draft text streaming in (DESIGN.md §10). We skip the splash loader: a writing tool should open straight to the page.

### Q9. Empty states that teach
- **Observed:** "There's no selected paper, click on the open area of any paper to select it". "Papers used by the AI for research will show up here. Try now" (`user-app-home-light.png`).
- **Why it works:** each panel explains what will appear there and how to fill it, in one sentence with one action.
- **Voxlace:** this matches DESIGN.md §7 and §6 `EmptyState` (one sentence + one action), for example "The posts this draft learned from will show up here."

### Q10. A docs-style reading view: "On this page" and copy buttons
- **Observed:** the docs page has a TOC column on the right, a **Copy page** button, "2 min read", and a floating "Ask ScholarXIV AI" pill (`docs-desktop-light.png`).
- **Why it works:** long content stays navigable, and the AI is one click away without taking over the page.
- **Voxlace:** the Voice screen (§4.5) can use the TOC pattern for long voice cards. "Copy" is already our LinkedIn hand-off. We don't add a floating AI pill, because the AI lives in the editor's revise box.

---

## 2. Interaction patterns worth borrowing

| Their pattern | Where it fits our flows (DESIGN.md §3) |
|---|---|
| Centered question + suggestion chips on an empty home | **Daily loop**, step 1: Today's empty state. The chips are our prompt starters. |
| Search box that docks to the bottom once results exist | Today's composer is pinned to the bottom once the day has items (§4.1). |
| Right context panel with "Selected" / "Referenced" lists | Editor `SourcesPanel`: the posts the draft used, with Pin and Exclude (FR-25). |
| Collapsible nav → icon rail | Our sidebar collapses to a rail at 1024–1279px, and to a bottom bar below 768px. |
| "Auto" chip beside the input (automatic model choice) | A "Platforms" chip group under the composer (X · LinkedIn · Telegram). |
| Bookmark / Save on a card | "Pin as an example" on a source post. Not on drafts, which already have statuses. |
| Notes on a paper | Our "Tell it what to change" box is the closest match. No separate notes feature. |
| Theme toggle in the sidebar header | The same place, cycling light → dark → mixed. |

## 3. What not to borrow

- **Seven actions on every card.** It suits researchers triaging papers, but our principle 1 needs one obvious next step. Draft cards get one action (Open); the editor has a single action bar.
- **The "engineering drawing sheet" 404** (`not-found-*.png`): all-caps letter-spaced mono labels such as "DWG NO. ERR-404". It's clever, but it breaks our sentence-case rule (§8) and doesn't fit a personal writing tool.
- **Brand colors per plan** (blue Go, purple Pro on pricing). That's marketing color; we keep one accent.
- **Big social-proof counters and a splash loader.** Those are for a landing page. Voxlace's first screen is the user's own page.
- **One sans for everything.** Their content is other people's papers; ours is the user's own voice, so it gets its own serif.
- **Their exact identity:** Archivo + Inter, the zinc palette with a near-black primary, the atom logo, their icons and their copy.
