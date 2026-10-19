# What goes on each screen

A checklist for deciding, per screen, which features are visible, which sit behind a menu, and which move somewhere else. **Fill in the "Your call" column**; once it's filled, this file is the spec for building each screen. DESIGN.md §2–§4 shows the layout; this file decides the contents.

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

---

## Everywhere (sidebar, mobile tab bar, avatar menu)

| Feature | Req | Priority | Suggestion | Your call |
|---|---|---|---|---|
| New post button | FR-7 | Must | Show (top of sidebar) | |
| Today · Drafts · Calendar · Voice | — | — | Show (sidebar; tab bar on mobile) | |
| Settings | FR-22 | Must | Menu (avatar) | |
| Theme: light / dark / mixed | DESIGN §5 | — | Menu (avatar) | |
| Today's usage, e.g. "12 of 30 drafts" | FR-30 | Must | Menu (avatar), plus a message when the limit is reached | |
| Notifications (a post is due, a Telegram send failed) | FR-35 | Must | Show a small bell when something needs action; otherwise hidden | |
| Log out | FR-27 | Must | Menu (avatar) | |

## Today

| Feature | Req | Priority | Suggestion | Your call |
|---|---|---|---|---|
| "What did you work on today?" box (the check-in) | FR-6 | Must | Show | |
| Platform toggles X · LinkedIn · Telegram | FR-8 | Must | Show (inside the box) | |
| Generate N drafts | FR-7 | Must | Show | |
| Save the check-in without generating | FR-6 | Must | Menu (⋯ in the box), or autosave | |
| Starter ideas | DESIGN §4.1 | — | Show while the box is empty | |
| Today's drafts (rows: platform, first line, status) | FR-11 | Must | Show | |
| Past check-ins (view, edit, delete) | FR-6 | Must | Move → Drafts (a "Check-ins" tab) | |
| GitHub items for today (commits, PR titles) | FR-14 | Should | Later (Phase 5+), then Menu (a "+ GitHub" chip in the box) | |
| Suggested time to post | FR-16 | Should | Move → the approve dialog | |
| Reminder settings | FR-42 | Must | Move → Settings | |
| Weekly publish rate | FR-15 | Should | Later, then Move → Drafts | |

## Draft editor

| Feature | Req | Priority | Suggestion | Your call |
|---|---|---|---|---|
| The draft text, editable by hand | FR-10 | Must | Show | |
| Length counter with the platform rule | FR-9 | Must | Show (under the text) | |
| "AI draft" tag | FR-11 | Must | Show (small tag) | |
| Status (Draft / Approved / Published / Discarded) | FR-11 | Must | Show (tag next to the title) | |
| Edit / Preview switch (how it will look on the platform) | DESIGN §1.5 | — | Show | |
| Quick changes (Shorter, Punchier, More casual, Add a hook) | FR-10 | Must | Show | |
| "Tell it what to change" box | FR-10, FR-40 | Must | Show | |
| Chat history (what you asked, what changed) | FR-40 | Must | Menu (opens above the box), not always open | |
| Versions and restore | FR-10 | Must | Menu (⟲) | |
| Discard draft | FR-11 | Must | Menu (⋯) | |
| Approve and schedule… (dialog: time + what will happen) | FR-12, FR-13 | Must | Show (one primary button) | |
| Publish to Telegram now (after approval) | FR-12 | Must | Show, replacing Approve once approved | |
| Copy and open LinkedIn / Open in X (after approval) | FR-12 | Must | Show, replacing Approve once approved | |
| Write the same post for another platform | FR-40 | Must | Menu (⋯ "Make an X version") | |
| Which past posts it learned from; Pin and Exclude | FR-25 | Must | Move → Voice (decided 19 Oct) | |
| Model name, backup model note | FR-31 | Must (recording only) | Cut from the screen (still recorded) | |
| "You posted about this before" warning | — | idea | Later (see PR #18: same-topic posts get copied) | |

## Drafts (library)

| Feature | Req | Priority | Suggestion | Your call |
|---|---|---|---|---|
| List of drafts: platform, first line, status, date | FR-10, FR-11 | Must | Show | |
| Filter by status and platform | FR-11 | Must | Show (two small filters) | |
| Search drafts | — | — | Later | |
| Discard / restore several at once | DESIGN §4.4 | — | Menu (select mode) | |
| Check-ins tab | FR-6 | Must | Show (tab) | |
| Weekly publish rate | FR-15 | Should | Later | |

## Calendar

| Feature | Req | Priority | Suggestion | Your call |
|---|---|---|---|---|
| Week view (month as a toggle) | FR-13 | Must | Show | |
| Move a post: drag, plus "Move to…" | FR-13 | Must | Show | |
| Up next (the next 3 posts) | FR-35 | Must | Show (top of the page) | |
| Telegram "sends automatically" / X and LinkedIn "reminder" | FR-35 | Must | Show (on each item) | |
| Failed Telegram send and the fix | FR-35, FR-36 | Must | Show (on the item and in notifications) | |
| Audience time on hover | FR-16 | Should | Later | |
| Best posting windows | FR-16, FR-34 | Should | Later, then Menu ("Suggest times") | |

## Voice

| Feature | Req | Priority | Suggestion | Your call |
|---|---|---|---|---|
| Tab per platform | FR-22 | Must | Show | |
| Voice card (editable; hand edits kept) | FR-5, FR-26 | Must | Show | |
| Stats (average length, emoji, hashtags, openers) | FR-5 | Must | Show, collapsed | |
| "Still learning" under 20 posts | FR-5 | Must | Show | |
| Your posts: pin as example / exclude | FR-25 | Must | Show (searchable list) | |
| Import an export, import again, last import counts | FR-1, FR-2, FR-3 | Must | Show (top: "Import posts") | |
| Excluded hashtags | FR-44 | Must | Menu ("Import settings") | |
| Inspiration creators per platform | FR-41 | Should | Later (Phase 3), then Show as its own section | |
| X Premium (longer posts) | Q31 | — | Show on the X tab (see OPEN_QUESTIONS Q31) | |

## Settings (from the avatar menu)

| Feature | Req | Priority | Suggestion | Your call |
|---|---|---|---|---|
| About you and the summary card | FR-17, FR-18 | Must | Show (Profile tab) | |
| Audience per platform, discipline, usual hours | FR-33 | Must | Show (Profile tab) | |
| Language | FR-24 | Must | Show (Profile tab) | |
| Resume and website import | FR-20, FR-21 | Should | Later | |
| Platform rules (limit, tone, structure notes) | FR-23 | Must | Menu ("Advanced", per platform) | |
| Telegram channel connection and check | FR-36 | Must | Show (Connections tab) | |
| Reminders (days, time, quiet hours, channel) | FR-42, FR-43 | Must | Show (Reminders tab) | |
| Usage today and limits | FR-30 | Must | Show (Account tab) | |
| Export my data / delete my account | FR-38 | Must | Show (Account tab, at the bottom) | |

## First run (onboarding)

| Feature | Req | Priority | Suggestion | Your call |
|---|---|---|---|---|
| Invite code | FR-28 | Must | Show | |
| Privacy notice to accept | FR-37 | Must | Show | |
| Pick platforms | FR-8 | Must | Show | |
| Upload one export, with how-to per platform | FR-1 | Must | Show | |
| Import result (412 posts · 31 skipped and why) | FR-1, FR-2 | Must | Show | |
| 3 quick questions (role, topics, audience) | FR-17, FR-33 | Must | Show (the rest of the form waits until later) | |
| First draft from a suggested topic | FR-7 | Must | Show | |
