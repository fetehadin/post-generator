# What goes on each screen

A checklist for deciding, per screen, which features are visible, which sit behind a menu, and which move somewhere else. **Decided 19 Oct 2026:** the product owner asked Claude to finish this list, so "Your call" holds the suggestions as decisions. Change any row at any time. This file is now the spec for building each screen; each screen is built in the phase that owns its requirement (BUILD_PLAN). DESIGN.md §2–§4 shows the layout; this file decides the contents.

**How to fill it in.** Write one of:
- **Show:** visible on the screen.
- **Menu:** one click away (⋯, avatar menu, a tab).
- **Move → X:** belongs on another screen.
- **Later:** after V1.
- **Cut:** not in the product.

"Must" items can only be moved or put behind a menu, not cut, unless the SRS changes too.

The suggestions follow the calm layout agreed on 19 Oct 2026:
- the left sidebar is for navigation only;
- there is no right sidebar;
- drafts show nothing about where they came from.

> **Changed by the product owner, 22 Oct 2026 (SRS 1.3, DESIGN.md §2 and §4 win over any row below):**
> - **Telegram is a hand-off** (copy + open your channel). No bot: the Telegram connection, "sends automatically", failed sends and Telegram reminders are **Later**.
> - **Home is a chat board** with threads in the left sidebar; each revision is a new draft card. The editor page becomes the thread.
> - **Right sidebar** with Notifications and Missed posts (a bell on narrow screens).
> - **Drafts** opens to X · LinkedIn · Telegram; cards have Reschedule, Copy now, Delete.
> - **Calendar** has month, week and day views.
> - **Approve asks only for the day**; the app picks the best hour (FR-45). Best posting hours (FR-16, FR-34) are **Show** (approve and calendar).
> - **Resume and portfolio import** (FR-20, FR-21) are **Show** in Profile.
> - **Audience per platform** (profession and places) is editable in Profile.
> - **Platform rules** (FR-23): no screen; changed by migration.
> - **Themes:** light and dark only, ScholarXIV colors.

> **Layout decided by the product owner, 21 Oct 2026** (DESIGN.md §2): the sidebar has Home · Calendar · Drafts, the theme toggle and a collapse button; **Voice and Settings now live inside Profile** (the avatar). Where a row below says Voice or Settings, read **Profile**. The editor's feedback is a **chat thread** (ChatGPT-style), and Calendar is a **Google Calendar-style grid** with a **Posted** button.

---

## Everywhere (sidebar, mobile tab bar, avatar menu)

| Feature | Req | Priority | Suggestion | Your call |
|---|---|---|---|---|
| Collapse the sidebar to an icon rail | — | — | Show (sidebar button, remembered per browser) | **Show** (owner) |
| New post button | FR-7 | Must | Show (top of sidebar) | **Show** |
| Today · Drafts · Calendar · Voice | — | — | Show (sidebar; tab bar on mobile) | **Show** |
| Settings | FR-22 | Must | Menu (avatar) | **Menu** |
| Theme: light / dark / mixed | DESIGN §5 | — | Show (sidebar toggle) | **Show** (owner) |
| Today's usage, e.g. "12 of 30 drafts" | FR-30 | Must | Menu (avatar), plus a message when the limit is reached | **Menu** |
| Notifications (a post is due, a Telegram send failed) | FR-35 | Must | Show a small bell when something needs action; otherwise hidden | **Show** a small bell when something needs action; otherwise hidden |
| Log out | FR-27 | Must | Menu (avatar) | **Menu** |

## Home (was Today)

| Feature | Req | Priority | Suggestion | Your call |
|---|---|---|---|---|
| "What did you work on today?" box (the check-in) | FR-6 | Must | Show | **Show** |
| Platform toggles X · LinkedIn · Telegram | FR-8 | Must | Show (inside the box) | **Show** |
| Generate N drafts | FR-7 | Must | Show | **Show** |
| Save the check-in without generating | FR-6 | Must | Menu (⋯ in the box), or autosave | **Menu** |
| Starter ideas | DESIGN §4.1 | — | Show while the box is empty | **Show** while the box is empty |
| Today's drafts (rows: platform, first line, status) | FR-11 | Must | Show | **Show** |
| Past check-ins (view, edit, delete) | FR-6 | Must | Move → Drafts (a "Check-ins" tab) | **Move** → Drafts |
| GitHub items for today (commits, PR titles) | FR-14 | Should | Later (Phase 5+), then Menu (a "+ GitHub" chip in the box) | **Later** |
| Suggested time to post | FR-16 | Should | Move → the approve dialog | **Move** → the approve dialog |
| Reminder settings | FR-42 | Must | Move → Settings | **Move** → Settings |
| Weekly publish rate | FR-15 | Should | Later, then Move → Drafts | **Later** |

## Draft editor

| Feature | Req | Priority | Suggestion | Your call |
|---|---|---|---|---|
| Feedback as a chat thread (ChatGPT-style): your requests and each new version, in order | FR-10, FR-40 | Must | Show | **Show** (owner) |
| The draft text, editable by hand | FR-10 | Must | Show | **Show** |
| Length counter with the platform rule | FR-9 | Must | Show (under the text) | **Show** |
| "AI draft" tag | FR-11 | Must | Show (small tag) | **Show** |
| Status (Draft / Approved / Published / Discarded) | FR-11 | Must | Show (tag next to the title) | **Show** |
| Edit / Preview switch (how it will look on the platform) | DESIGN §1.5 | — | Show | **Show** |
| Quick changes (Shorter, Punchier, More casual, Add a hook) | FR-10 | Must | Show | **Show** |
| "Tell it what to change" box | FR-10, FR-40 | Must | Show | **Show** |
| Chat history (what you asked, what changed) | FR-40 | Must | Menu (opens above the box), not always open | **Menu** |
| Versions and restore | FR-10 | Must | Menu (⟲) | **Menu** |
| Discard draft | FR-11 | Must | Menu (⋯) | **Menu** |
| Approve and schedule… (dialog: time + what will happen) | FR-12, FR-13 | Must | Show (one primary button) | **Show** |
| Publish to Telegram now (after approval) | FR-12 | Must | Show, replacing Approve once approved | **Show** |
| Copy and open LinkedIn / Open in X (after approval) | FR-12 | Must | Show, replacing Approve once approved | **Show** |
| Write the same post for another platform | FR-40 | Must | Menu (⋯ "Make an X version") | **Menu** |
| Which past posts it learned from; Pin and Exclude | FR-25 | Must | Move → Voice (decided 19 Oct) | **Move** → Voice |
| Model name, backup model note | FR-31 | Must (recording only) | Cut from the screen (still recorded) | **Cut** from the screen |
| "You posted about this before" warning | — | idea | Later (see PR #18: same-topic posts get copied) | **Later** |

## Drafts (library)

| Feature | Req | Priority | Suggestion | Your call |
|---|---|---|---|---|
| List of drafts: platform, first line, status, date | FR-10, FR-11 | Must | Show | **Show** |
| Filter by status and platform | FR-11 | Must | Show (two small filters) | **Show** |
| Search drafts | — | — | Later | **Later** |
| Discard / restore several at once | DESIGN §4.4 | — | Menu (select mode) | **Menu** |
| Check-ins tab | FR-6 | Must | Show (tab) | **Show** |
| Weekly publish rate | FR-15 | Should | Later | **Later** |

## Calendar

| Feature | Req | Priority | Suggestion | Your call |
|---|---|---|---|---|
| Google Calendar-style grid (days × hours), drag to change date and time | FR-13 | Must | Show | **Show** (owner) |
| **Posted**: marks an X or LinkedIn post as published and clears it from the calendar (it stays in Drafts as Published) | FR-12, FR-15 | Must | Show | **Show** (owner) |
| Week view (month as a toggle) | FR-13 | Must | Show | **Show** |
| Move a post: drag, plus "Move to…" | FR-13 | Must | Show | **Show** |
| Up next (the next 3 posts) | FR-35 | Must | Show (top of the page) | **Show** |
| Telegram "sends automatically" / X and LinkedIn "reminder" | FR-35 | Must | Show (on each item) | **Show** |
| Failed Telegram send and the fix | FR-35, FR-36 | Must | Show (on the item and in notifications) | **Show** |
| Audience time on hover | FR-16 | Should | Later | **Later** |
| Best posting windows | FR-16, FR-34 | Should | Later, then Menu ("Suggest times") | **Later** |

## Profile → your posts and voice (was Voice)

| Feature | Req | Priority | Suggestion | Your call |
|---|---|---|---|---|
| Tab per platform | FR-22 | Must | Show | **Show** |
| Voice card (editable; hand edits kept) | FR-5, FR-26 | Must | Show | **Show** |
| Stats (average length, emoji, hashtags, openers) | FR-5 | Must | Show, collapsed | **Show** |
| "Still learning" under 20 posts | FR-5 | Must | Show | **Show** |
| Your posts: pin as example / exclude | FR-25 | Must | Show (searchable list) | **Show** |
| Import an export, import again, last import counts | FR-1, FR-2, FR-3 | Must | Show (top: "Import posts") | **Show** |
| Excluded hashtags | FR-44 | Must | Menu ("Import settings") | **Menu** |
| Inspiration creators per platform | FR-41 | Should | Later (Phase 3), then Show as its own section | **Later** |
| X Premium (longer posts) | Q31 | — | Show on the X tab (see OPEN_QUESTIONS Q31) | **Show** on the X tab |

## Profile → settings (was Settings)

| Feature | Req | Priority | Suggestion | Your call |
|---|---|---|---|---|
| About you and the summary card | FR-17, FR-18 | Must | Show (Profile tab) | **Show** |
| Audience per platform, discipline, usual hours | FR-33 | Must | Show (Profile tab) | **Show** |
| Language | FR-24 | Must | Show (Profile tab) | **Show** |
| Resume and website import | FR-20, FR-21 | Should | Later | **Later** |
| Platform rules (limit, tone, structure notes) | FR-23 | Must | Menu ("Advanced", per platform) | **Menu** |
| Telegram channel connection and check | FR-36 | Must | Show (Connections tab) | **Show** |
| Reminders (days, time, quiet hours, channel) | FR-42, FR-43 | Must | Show (Reminders tab) | **Show** |
| Usage today and limits | FR-30 | Must | Show (Account tab) | **Show** |
| Export my data / delete my account | FR-38 | Must | Show (Account tab, at the bottom) | **Show** |

## First run (onboarding)

| Feature | Req | Priority | Suggestion | Your call |
|---|---|---|---|---|
| Invite code | FR-28 | Must | Show | **Show** |
| Privacy notice to accept | FR-37 | Must | Show | **Show** |
| Pick platforms | FR-8 | Must | Show | **Show** |
| Upload one export, with how-to per platform | FR-1 | Must | Show | **Show** |
| Import result (412 posts · 31 skipped and why) | FR-1, FR-2 | Must | Show | **Show** |
| 3 quick questions (role, topics, audience) | FR-17, FR-33 | Must | Show (the rest of the form waits until later) | **Show** |
| First draft from a suggested topic | FR-7 | Must | Show | **Show** |
