# Design Guide — Voxlace

How Voxlace should look, feel and behave, and how to design it with Claude Code. Read this before building any screen. Requirements still live in [`SRS.md`](SRS.md); this guide says how to present them.

> **The one idea behind every screen:** the user is the author, Voxlace is the drafter. Every screen should make it obvious what the AI wrote, why, and what will happen when the user clicks.

---

## Contents

1. [Design principles](#1-design-principles)
2. [Information architecture](#2-information-architecture)
3. [Core flows](#3-core-flows)
4. [Screen specs](#4-screen-specs)
5. [Visual direction](#5-visual-direction)
6. [Components](#6-components)
7. [States: loading, empty, error](#7-states-loading-empty-error)
8. [Writing in the interface](#8-writing-in-the-interface)
9. [Accessibility](#9-accessibility)
10. [Responsive and motion](#10-responsive-and-motion)
11. [Designing with Claude Code](#11-designing-with-claude-code)
12. [Design QA checklist](#12-design-qa-checklist)
13. [Sources](#13-sources)

---

## 1. Design principles

Grounded in Microsoft's 18 Guidelines for Human-AI Interaction (G1–G18) and research on editing text with LLMs.

| # | Principle | What it means on screen | Grounded in |
|---|---|---|---|
| 1 | **You're the author** | Nothing leaves the app without an explicit Approve or Publish click. The button says exactly what happens: "Publish to Telegram now", not "Submit". | G16 (convey consequences), FR-12, NFR-6 |
| 2 | **Show your sources** | Every draft shows which of your past posts shaped it ("Based on 8 of your posts") and opens them on click. | G11 (explain why) |
| 3 | **Be honest about quality** | Show voice strength per platform from post count ("12 posts: voice is still learning"). Never promise a perfect match. | G1–G2 (what it can do, how well), FR-5 |
| 4 | **Fix in one click** | Quick revisions (Shorter, Punchier, More casual) sit next to a free-text "Tell it what to change" box. People use both. | G9 (efficient correction); toolbar + free-prompt study |
| 5 | **Preview the real thing** | Drafts render the way each platform shows them: X's limit and line breaks, LinkedIn's "see more" fold at about 210 characters. | Platform rules, FR-9 |
| 6 | **Never lose input** | A failed or slow generation keeps the topic, check-in and edits exactly where they were. | NFR-4 |
| 7 | **Remember, then adapt slowly** | Recent topics and check-ins stay one click away. Voice cards change only when the user regenerates or edits them. | G12–G14, FR-26 |
| 8 | **Calm by default** | One accent color, one place for boldness: the draft. The interface recedes so the user's words stand out. | Frontend aesthetics guidance |

---

## 2. Information architecture

Five places in a left sidebar on desktop, a bottom bar on mobile. Each maps to SRS requirements.

| Nav item | Purpose | Requirements |
|---|---|---|
| **Today** | Chat board: write a check-in, ask for drafts, see today's drafts | FR-6, FR-7, FR-8 |
| **Drafts** | Library of every draft by status and platform; opens the editor | FR-10, FR-11 |
| **Calendar** | Week and month plan; due posts; Telegram sends | FR-13, FR-35 |
| **Voice** | Per-platform voice card, stats, pinned and excluded posts, imports | FR-1, FR-5, FR-22, FR-25, FR-26 |
| **Settings** | Profile, audience, language, Telegram connection, usage, export/delete | FR-17, FR-24, FR-30, FR-33, FR-36, FR-38 |

The **draft editor** isn't a nav item. It opens from Today, Drafts or Calendar as a full page (`/drafts/:id`), so every draft has a shareable URL and the back button works.

---

## 3. Core flows

### First run: from sign-up to first draft in under 5 minutes

Activation is a success metric (SRS §9), so onboarding asks only what the first draft needs. Everything else can wait.

```mermaid
flowchart LR
    A[Invite code + login] --> B[Privacy notice<br/>accept]
    B --> C[Pick platforms<br/>X · LinkedIn · Telegram]
    C --> D[Upload one export<br/>with how-to per platform]
    D --> E[Import result<br/>412 posts · 31 skipped]
    E --> F[3 quick questions<br/>role · topics · audience]
    F --> G[First draft<br/>from a suggested topic]
    G --> H[Finish profile later<br/>banner on Today]
```

- Upload **one** export to start. The others can be added from Voice.
- The export how-to opens beside the upload box: steps, screenshots and "takes about a day" for LinkedIn.
- The first topic is suggested ("Write about what you're building this week") so the user doesn't face a blank box.

### Daily loop

```mermaid
flowchart LR
    A[Today: write check-in] --> B[Generate for 1–3 platforms]
    B --> C[Editor: revise by chat or hand]
    C --> D{Ready?}
    D -->|Not yet| C
    D -->|Yes| E[Approve]
    E --> F[Pick a time or publish now]
    F --> G[Calendar shows it]
    G --> H[Telegram: worker sends<br/>X/LinkedIn: reminder + hand-off]
    H --> I[Marked published]
```

---

## 4. Screen specs

Wireframes show layout and hierarchy, not final styling.

### 4.1 Today (chat board)

The home screen. A single stream: check-ins, draft requests and draft cards in time order.

```
┌ Sidebar ┐┌──────────────────────────────────────────────────────┐
│ Today   ││  Wed 21 Oct                                          │
│ Drafts  ││  ┌ Check-in ──────────────────────────────────────┐  │
│ Calendar││  │ Finished the Telegram importer, 412 posts in.  │  │
│ Voice   ││  └────────────────────────────────────────────────┘  │
│ Settings││  ┌ Draft · X ─────────── 214/280 ─ Draft ┐            │
│         ││  │ Small win today: …                    │ Open       │
│ Usage   ││  └───────────────────────────────────────┘            │
│ 12/30   ││  ┌───────────────────────────────────────────────┐   │
│         ││  │ What did you work on today?                   │   │
│         ││  │ [X] [LinkedIn] [Telegram]   Save · Generate   │   │
└─────────┘└──└───────────────────────────────────────────────┘───┘
```

- **Composer pinned to the bottom**, with platform toggles and two actions: **Save check-in** and **Generate drafts**.
- Prompt starters above an empty composer: "What did you ship today?", "A lesson from this week", "Turn a commit into a post".
- Draft cards show platform, first lines, live count, status and **Open**. No inline editing here; the editor is the one place to edit.
- Generation streams into a placeholder card that appears immediately (see §7).

### 4.2 Draft editor (the most important screen)

```
┌──────────────────────────────────────────────────────────────────┐
│ ← Drafts      X draft · Draft · v3            Versions ▾  Discard │
├───────────────────────────────┬──────────────────────────────────┤
│ EDIT                          │ PREVIEW (as it will look on X)   │
│ ┌───────────────────────────┐ │ ┌──────────────────────────────┐ │
│ │ Small win today: the      │ │ │ (avatar) Fetehadin @…        │ │
│ │ Telegram importer works…  │ │ │ Small win today: the         │ │
│ │                           │ │ │ Telegram importer works…     │ │
│ └───────────────────────────┘ │ └──────────────────────────────┘ │
│ 214 / 280  ✓                  │ Based on 8 of your posts  View   │
│ [Shorter] [Punchier] [Casual] │                                  │
│ [Add a hook] [Remove emoji]   │ AI-generated draft. Review       │
│ ┌ Tell it what to change… ──┐ │ before posting.                  │
│ └───────────────────────────┘ │                                  │
├───────────────────────────────┴──────────────────────────────────┤
│ Schedule: Thu 22 Oct, 18:00 (your time) ▾    [ Approve ]          │
└──────────────────────────────────────────────────────────────────┘
```

- **Two columns on desktop:** editable text on the left, platform-true preview on the right. One column on mobile with an Edit / Preview switch.
- **Quick actions + free text.** Pre-set revisions for the common cases; a free box for everything else, with placeholder examples ("Mention that it took 3 tries").
- **Select text, then revise only that part.** Highlighting a sentence scopes the next revision to it.
- **Versions:** every revision is a version (FR-10). The menu shows each with its instruction ("v2 · Shorter") and a diff against the current one. Restoring is one click.
- **Length counter** sits right under the text, turns amber within 10% of the limit and red over it, and says how many characters to cut. Over the limit, Approve is disabled with the reason shown, not just greyed out.
- **"Based on 8 of your posts"** opens a side panel of the retrieved examples (from the prompt log), with Pin and Exclude buttons (FR-25).
- **Footer action bar is sticky** and shows the consequence: after approval, the button becomes "Publish to Telegram now" or "Open in X". For LinkedIn: "Copy text and open LinkedIn", then a "Copied" confirmation.

### 4.3 Calendar

- **Week view by default**, month view as a toggle. Times shown in the user's zone, with the audience's zone on hover when they differ (FR-16).
- Each item shows platform, the first words and status (approved, scheduled, sent, failed).
- **Drag to reschedule, and an alternative that doesn't need dragging:** every item has a "Move to…" menu with a date and time picker (WCAG 2.5.7).
- Click an empty slot to "Plan a draft here", which opens Today with that time preset.
- Telegram items that the worker will send show "Sends automatically"; X and LinkedIn items show "Reminder at 18:00".

### 4.4 Drafts library

- A list, not a card grid: platform, first line, status, scheduled time, last edited. Sortable, filterable by status and platform.
- Bulk actions only where safe: discard and restore. No bulk publish.

### 4.5 Voice

- **One tab per platform.** Each shows the voice card (editable text; hand edits marked and kept on regenerate, FR-26), measured stats (average length, emoji per post, hashtags, common openers), voice strength from post count, pinned posts and excluded posts.
- **Imports** section: last import per platform, counts, skipped reasons, "Import again".

### 4.6 Settings

Profile and summary card (FR-17, FR-18), audience per platform (FR-33), language (FR-24), Telegram connection with a status check (FR-36), usage today vs limits (FR-30), export and delete my data (FR-38). Delete asks the user to type "delete" and says exactly what will be removed.

---

## 5. Visual direction

**Decided 19 Oct 2026 (v2).** Derived from a study of ScholarXIV ([`design/REFERENCE_SCHOLARXIV.md`](../design/REFERENCE_SCHOLARXIV.md)): we take its principles, not its identity. Prototypes: [`design/prototypes/`](../design/prototypes/), which open in any browser. The tokens live in [`design/prototypes/tokens.css`](../design/prototypes/tokens.css). `frontend/src/index.css` still has the v1 values and switches to these in the next frontend PR.

**Concept: "ink on paper, with one thread."**
- The user's words are ink on a page, set in a serif.
- The app is the desk around that page: warm, quiet and flat.
- One teal **thread** marks everything the AI drew on: sources, focus, links and the AI label.

What we kept from the study:
- a monochrome base where color carries meaning
- borders and tinted boxes instead of shadows
- three columns: navigation, work, context
- an empty screen that asks first, with starter prompts
- a quiet metadata line on each card
- real dark themes
- 150 ms color-only motion

What's ours:
- warm paper neutrals (theirs are cool zinc)
- a serif for the user's writing
- the teal thread
- a **mixed** theme
- Ethiopic-ready fonts

### Themes

| Theme | What it is | When |
|---|---|---|
| Light | Paper background, white page | Default when the system is light |
| Dark | Warm off-black, never pure black | Default when the system is dark |
| **Mixed** | Dark chrome (sidebar, panels, background) around a **light page** (editor, draft cards, previews): a desk lamp on paper | Writing at night without losing the page's look; only Voxlace has it |

How it works:
- The toggle sits in the sidebar header and cycles light → dark → mixed.
- The choice is saved per user, and the system preference is the first default.
- In code it's `<html data-theme="…">`. Anything marked `.page` switches back to the light tokens in the mixed theme.

### Color tokens

| Token | Light | Dark | Use |
|---|---|---|---|
| `--paper` | `#F7F6F3` | `#161513` | App background (the desk) |
| `--surface` | `#FFFFFF` | `#1E1C19` | The page: editor, cards, previews |
| `--sunken` | `#EFEDE8` | `#282622` | Notes, source posts, inactive chips |
| `--line` | `#E2DFD8` | `#34312C` | Dividers and card borders (decorative) |
| `--edge` | `#8A8478` | `#7A7469` | Outlines of inputs and buttons (≥ 3:1) |
| `--ink` | `#1F1D1A` | `#EDEAE4` | Main text |
| `--ink-2` | `#5C574E` | `#A9A399` | Secondary text, meta lines, placeholders |
| `--on-ink` | `#FAF9F6` | `#1F1D1A` | Text on ink (avatar, brand mark) |
| `--thread` | `#2B6B5B` | `#72C4AE` | The one accent: **primary buttons**, links, focus ring, AI label, sources, selected chips |
| `--on-thread` | `#FFFFFF` | `#161513` | Text on primary buttons |
| `--thread-soft` | `#E2EEE9` | `#1F3530` | Current nav item, selected chip fill |
| `--signal` | `#8F5508` | `#E3A64C` | Near the limit, "still learning", scheduled |
| `--danger` | `#B42318` | `#F2806F` | Over the limit, errors, delete |

**Contrast, all measured (WCAG 2.2 AA: 4.5:1 for text, 3:1 for UI parts):**

| Pair | Light | Dark |
|---|---|---|
| `--ink` on `--paper` / `--surface` / `--sunken` | 15.6 / 16.8 / 14.4 | 15.2 / 14.2 / 12.6 |
| `--ink-2` on `--paper` / `--surface` / `--sunken` | 6.6 / 7.2 / 6.1 | 7.3 / 6.8 / 6.0 |
| `--thread` on `--paper` / `--surface` / `--thread-soft` | 5.8 / 6.3 / 5.3 | 8.9 / 8.3 / 6.4 |
| `--signal` on `--paper` / `--surface` | 5.6 / 6.1 | 8.5 / 8.0 |
| `--danger` on `--paper` / `--surface` | 6.1 / 6.6 | 7.0 / 6.6 |
| `--on-thread` on `--thread` (primary button) | 6.3 | 8.9 |
| `--on-ink` on `--ink` (avatar) | 16.0 | 14.0 |
| `--edge` on `--surface` / `--paper` (input outlines) | 3.7 / 3.4 | 3.7 / 3.9 |
| Focus ring `--thread` on `--paper` | 5.8 | 8.9 |

Mixed uses the dark values for chrome and the light values on `.page`, so every pair above still applies.

- **Platform colors only in small badges**, never as backgrounds.
- **Status never by color alone:** the counter has an icon and words ("fits on X", "24 left", "12 over"); selected chips show ✓.
- Avoid the common generated looks: purple-to-blue gradients, cream with terracotta, black with acid green, identical cards with the same soft shadow.

### Type

| Role | Typeface | Fallback for Amharic (FR-24) | Notes |
|---|---|---|---|
| Interface | **Instrument Sans** 400/600 | **Noto Sans Ethiopic** | Labels, buttons, navigation. Sentence case. |
| The user's writing | **Source Serif 4** 400/600 | **Noto Serif Ethiopic** | Editor, check-ins, draft cards, source posts: 18px, line-height 1.7, at most 68 characters a line |
| Platform previews | The platform's own system stack (+ Noto Sans Ethiopic) | same | So the preview looks like the real post |
| Numbers in counters | Interface font with `tabular-nums` | — | Digits don't jump while typing |

Neither Latin face has Ethiopic letters, so the browser takes each Amharic character from the Noto Ethiopic fallback named right after it. Both Noto faces match the x-height and weight closely, and the prototypes test this with an Amharic line. All four fonts are on Google Fonts under the OFL licence. **Self-host them in the app** (no third-party font requests from user pages).

| Token | Size | Use |
|---|---|---|
| `--text-xs` | 13px | Meta lines, badges, hints |
| `--text-sm` | 14px | Buttons, navigation, labels |
| `--text-md` | 16px | Interface body |
| `--text-lg` | 18px | The user's writing |
| `--text-xl` | 22px | Brand, panel titles |
| `--text-2xl` | 30px | Page questions ("What did you work on today?") |

Headings 22px and up use `--tracking-tight` (−0.02em). Interface line-height is 1.5; writing line-height is 1.7. **Weights: 400 and 600 only.**

### Space and shape

- 4px grid: `--space-1` to `--space-12` = 4, 8, 12, 16, 24, 32, 48.
- Radius: `--radius-control` 8px (buttons, inputs, nav items), `--radius-panel` 12px (cards, panels, composer), `--radius-pill` (chips, send button, status badges).
- **Borders separate, shadows float.** Cards and panels get a 1px `--line` border. Only menus, dialogs and toasts use `--shadow-float`. Focused inputs get a 1px `--thread` ring around the border.
- **Bars never hide focus** (WCAG 2.4.11): pages with a sticky composer or action bar set `scroll-padding-bottom` to the bars' height.
- Layout: nav `232px` → icon rail `64px` below 1280px → bottom bar below 768px. Context column `360px`, hidden below 1024px (the editor moves it under the editor instead). Today's stream is `--column` (760px) wide, and the writing is at most `68ch` wide. Context panels are plain lists divided by `--line` rules, not tinted boxes.

### Motion

- `--duration` 150ms with `--ease` `cubic-bezier(0.2, 0, 0, 1)`, for color and background only.
- The one signature moment is the draft text streaming in (§10).
- `prefers-reduced-motion` sets the duration to 0.

### Side by side: their measured values → ours

| Property | ScholarXIV (measured) | Voxlace |
|---|---|---|
| Interface font | Archivo (app), Inter (docs) | Instrument Sans + Noto Sans Ethiopic |
| Content font | Same sans | Source Serif 4 + Noto Serif Ethiopic (the user's ink) |
| Background light / dark | `#FFFFFF` / `#171717` | `#F7F6F3` warm paper / `#161513` warm off-black |
| Neutral hue | Cool zinc (hue 240) | Warm stone (hue ~40) |
| Primary button | Near-black `hsl(240 5.9% 10%)`, flips to white in dark | Teal `--thread`: the AI's color is also the "go" color |
| Accent | Almost none; green status dot, green docs nav | One teal `--thread` with a single meaning: "the AI drew on this" |
| Border | `#E4E4E7`, 1px | `--line #E2DFD8` decorative, `--edge #8A8478` for controls (≥ 3:1) |
| Radius controls / cards | 6px / 12px | 8px / 12px, pills for chips |
| Shadows | None, except floating tabs | None, except menus, dialogs and toasts |
| Reading text | 16px / 1.7, max 808px | 18px serif / 1.7, max 68ch |
| Headings | 36px/500, −0.9px tracking | 30px/600, −0.02em |
| Motion | 150ms `cubic-bezier(0.4,0,0.2,1)`, color + shadow | 150ms `cubic-bezier(0.2,0,0,1)`, color only |
| Themes | Light, dark (`html.dark`) | Light, dark, **mixed** (`html[data-theme]`) |

---

## 6. Components

**Recommendation: [shadcn/ui](https://ui.shadcn.com/docs).** It copies accessible component source into your repo (built on headless primitives and Tailwind), so you own and restyle the code instead of fighting a library's look. *This is a new dependency, so agree on it together before Phase 2 (CLAUDE.md "Ask before you").*

Product components to build on top:

| Component | Job | Must have |
|---|---|---|
| `DraftEditor` | Edit the text | Serif text, selection-scoped revise, autosave indicator |
| `PlatformPreview` | Show the real look | X, LinkedIn (with "see more" fold), Telegram variants |
| `LengthCounter` | Count by platform rule | Uses the shared counting rules and fixture (OPEN_QUESTIONS Q14); amber/red states with text, not color alone |
| `QuickActions` | One-click revisions | Labelled buttons, keyboard reachable, disabled while generating |
| `ReviseBox` | Free-text instruction | Placeholder examples, Enter to send, Shift+Enter for a new line |
| `VersionMenu` | History and restore | Instruction per version, diff view |
| `SourcesPanel` | "Based on N posts" | Retrieved posts with Pin and Exclude |
| `StatusBadge` | Draft status | Text label + icon, never color alone |
| `AiLabel` | "AI-generated draft. Review before posting." | Always visible in the editor |
| `ActionBar` | Approve / Publish / Open in X | Button text states the consequence |
| `CalendarItem` | A planned post | Drag + "Move to…" menu, status, platform |
| `EmptyState` | First-use guidance | One sentence + one action |
| `Toast` | Confirm results | Same verb as the action ("Published to Telegram") |

---

## 7. States: loading, empty, error

| Situation | What the user sees |
|---|---|
| Generating | A draft card or editor placeholder appears instantly with "Writing your X draft…", and text streams in. The input stays editable. Screen readers hear "Draft ready" when done (`aria-live="polite"`). |
| Slow response | After 3 seconds the placeholder adds "Still working…"; after 20 seconds (NFR-3) offer **Cancel** and **Try again**. Never a blank screen. |
| Rate-limited (429) | "The AI is busy right now. Your text is saved. Try again in a minute." with **Try again**. |
| AI unavailable (503) | "Drafts are unavailable right now. Your check-in is saved." |
| Fallback model used | Small note under the draft: "Written by the backup model." (FR-31) |
| Daily limit reached | "You've used today's 30 drafts. You can generate more tomorrow." (Which "day" is still OPEN_QUESTIONS Q10.) |
| Under 20 posts | Voice strength badge: "Still learning: import more posts for a closer match." (FR-5) |
| Empty Today | Prompt starters + "Write today's check-in". |
| Empty Drafts | "Your drafts will appear here. Start from Today." with a button. |
| Empty Calendar | "Approve a draft and pick a time to see it here." |
| Import failed | Names the problem and the fix: "This isn't a Telegram export. Export your channel as JSON from Telegram Desktop." |
| Telegram send failed | Calendar item turns `--danger` with "Didn't send: the bot isn't an admin any more. Reconnect." |

---

## 8. Writing in the interface

- **One verb per action, everywhere.** Generate → Revise → Approve → Schedule → Publish. The toast repeats the verb: Publish → "Published".
- **Sentence case** for everything. No all-caps labels.
- **Say what happens.** "Publish to Telegram now", "Open in X", "Copy text and open LinkedIn".
- **Errors say what happened and what to do.** No "Oops", no apologies, never "Something went wrong" alone.
- **Talk about the user's world**, not the system: "your posts", "your voice", not "embeddings", "vectors" or "RAG".
- **Times always with a zone hint** when it's ambiguous: "18:00 your time (10:00 New York)".

---

## 9. Accessibility

Target **WCAG 2.2 AA**. The 2.2 additions matter here:

| Criterion | Where it bites in Voxlace |
|---|---|
| 2.5.7 Dragging movements (AA) | Calendar drag must have a click alternative ("Move to…") |
| 2.5.8 Target size, minimum 24×24px (AA) | Quick-action chips, calendar items, icon buttons |
| 2.4.11 Focus not obscured (AA) | The sticky action bar and the bottom composer must not cover the focused element |
| 3.3.8 Accessible authentication (AA) | Login allows password managers and paste; no puzzles |
| 3.3.7 Redundant entry (A) | Don't ask for audience or time zone twice across onboarding and settings |

Also:
- Visible focus ring in `--thread` on every interactive element.
- Status is never color alone: add text or an icon (counter, badges, calendar).
- Respect `prefers-reduced-motion` and `prefers-color-scheme`.
- Keyboard: `⌘/Ctrl+Enter` sends the composer or revise box, `Esc` closes panels. Avoid single-letter shortcuts (WCAG 2.1.4); show shortcuts in tooltips.
- Every form field has a visible label; errors are linked to their field.

---

## 10. Responsive and motion

- **Desktop-first** for writing and planning (1280px). **Mobile must handle the quick jobs:** check a due post, approve, publish, copy. Test at 390px.
- Breakpoints: below 768px the sidebar becomes a bottom bar and the editor becomes one column with an Edit / Preview switch.
- **Motion only in response to the user,** and one signature moment: the draft text streaming in. No fade-ins on every section, no hover animation on every card.

---

## 11. Designing with Claude Code

Use **Opus** for design work (`/model opus` in Claude Code): it's the strongest at planning, critique and following a long spec. These steps follow Claude Code's own best practices: plan before you code, and give Claude a check it can run, such as a screenshot compared against the plan.

### The loop for each screen

```mermaid
flowchart LR
    A[Brief<br/>job · primary action · states] --> B[Plan mode<br/>tokens · ASCII wireframe]
    B --> C{You approve?}
    C -->|No| B
    C -->|Yes| D[Build against mocks]
    D --> E[Screenshots<br/>1280 + 390 · light + dark]
    E --> F[design-reviewer subagent<br/>checks this guide + WCAG]
    F -->|Must-fix found| D
    F -->|Clean| G[PR with screenshots]
```

1. **Run `/design-screen <screen>`** (in `.claude/skills/`). It reads this guide and the screen's requirements, writes a brief and an ASCII wireframe, and **stops for your approval**.
2. **Build against mocks** that match `docs/API.md` (`VITE_USE_MOCKS=true`), so design isn't blocked on the backend.
3. **Screenshot and compare.** Claude takes screenshots with Playwright at desktop and mobile widths, in light and dark, and reads them back. A picture of the result is the verification step.
4. **Second opinion.** The `design-reviewer` subagent (`.claude/agents/`) reviews the screenshots against this guide in a fresh context, so the agent that built it isn't grading itself.
5. **PR with before/after screenshots.** The teammate reviews the pictures first, then the code.

### Prompting tips that work

- **Paste a screenshot** of a reference (your sketch, a Figma frame, a competitor screen) and say "match this layout, use our tokens".
- **Name what to avoid** as well as what you want: "no card grid, no gradient, no all-caps labels".
- **Give it real content** from `samples/` instead of lorem ipsum, so line lengths and edge cases are real.
- **One screen per session.** Run `/clear` between screens to keep context lean.
- **Two failed corrections? Start fresh** with a better brief instead of correcting a third time.

### Optional tools (add only if needed)

- Anthropic's `frontend-design` plugin, via `/plugin`, adds general aesthetic guidance. This guide already covers it for Voxlace.
- A Figma MCP server, only if you design in Figma first.

---

## 12. Design QA checklist

Run before every UI pull request (the `design-reviewer` agent uses this list):

- [ ] The primary action is obvious, and its label says what happens
- [ ] AI-generated label visible; nothing publishes without approval
- [ ] "Based on N posts" shown on drafts
- [ ] Loading, empty, error and over-limit states designed, not just the happy path
- [ ] Only tokens from §5; no hard-coded colors or one-off font sizes
- [ ] User's writing in the serif; interface in the sans; sentence case
- [ ] Contrast passes (4.5:1 text, 3:1 UI); status not shown by color alone
- [ ] Keyboard: every action reachable, focus visible and not covered
- [ ] Targets at least 24×24px; drag has a click alternative
- [ ] Works at 390px and 1280px, light and dark
- [ ] Reduced motion respected
- [ ] Copy follows §8: one verb per action, specific errors, no jargon

---

## 13. Sources

- [Microsoft HAX Toolkit: Guidelines for Human-AI Interaction](https://www.microsoft.com/en-us/haxtoolkit/library/)
- [Nielsen Norman Group: Adding UI Controls to Prompting](https://www.nngroup.com/articles/prompt-controls-genai/)
- [Functional Flexibility in Generative AI Interfaces: text editing with LLMs through conversations, toolbars and prompts (arXiv 2410.10644)](https://arxiv.org/pdf/2410.10644)
- [W3C: What's new in WCAG 2.2](https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/)
- [Claude: Improving frontend design through Skills](https://claude.com/resources/articles/improving-frontend-design-through-skills)
- [Claude Code: Best practices](https://code.claude.com/docs/en/best-practices)
- [shadcn/ui documentation](https://ui.shadcn.com/docs)
