# The Telegram bot posts approved drafts at their planned time

Until 24 Nov 2026 Voxlace never posted by itself: every post needed a click at the moment it went out (CLAUDE.md rule 4, SRS C-6). We decided that approving a draft with a time is the user's consent: for a channel connected to the Voxlace bot, the bot posts the draft at that time without a further click. X and LinkedIn can't be posted to by Voxlace, so at their time they become due for a hand-off. Rule 4 becomes "nothing is posted unless the user approved it, with a time or with Post now"; the line "V1 never posts by itself" is removed.

## Considered options

- **Click only (what we had):** safest, but scheduling a Telegram post then still needs the user at the right minute, which defeats the point of scheduling.
- **Bot posts at the planned time (chosen):** what people expect from scheduling. The approve step says it plainly ("The bot posts this to <channel> on Tue at 18:00"), and Post now stays available.

## Consequences

- The server needs a background sender that picks due Telegram drafts, posts each exactly once (`FOR UPDATE SKIP LOCKED`, posted time set in the same transaction) and marks failures as missed, with Post now and Pick another time.
- Disconnecting the channel, or the bot losing its post right, means approved Telegram drafts fall back to being due for a hand-off.
