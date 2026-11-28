# Voxlace

Voxlace learns how a person writes from their own posts and drafts new posts for X, LinkedIn and Telegram from what they did. The person reviews, approves and posts every one.

## What the user brings

**Check-in**:
Something the user did or learned, with its date, typed by them or arriving from their GitHub activity; drafts are written from it now or it is kept for later.
_Avoid_: Topic, idea, prompt, note

**Fact**:
A lasting truth about the user ("our app has 2,000 users") kept in the summary card, which any later draft may state.
_Avoid_: Memory, note, detail

**Suggestion**:
An idea for a post that Voxlace offers on its own from the day's GitHub check-in; drafts are written only after the user picks the platforms.
_Avoid_: Digest, recommendation, auto-draft

**Shortcut**:
A word starting with "/" in the message box that does one clear thing, such as remembering a fact or telling the voice card a preference.
_Avoid_: Agent, command, slash command

## Drafting

**Chat**:
One conversation about one content idea: its check-ins (one or more, over time), the drafts made from them and every change asked for.
_Avoid_: Thread, conversation

**Draft**:
One post for one platform, from its first words until it is posted or discarded.
_Avoid_: Card, post (before it is posted), variant

**Version**:
One text of a draft; every change, hand edit or "another version" makes a new one, and older ones can be restored.
_Avoid_: Revision, card, iteration

## Posting

**Platform**:
Where a post goes: X, LinkedIn or Telegram.
_Avoid_: Network, account, channel

**Channel**:
The user's own Telegram channel that the Voxlace bot may post to.
_Avoid_: Using "channel" for X or LinkedIn

**Picture**:
An image the user adds to one draft, posted with it and deleted from Voxlace once the draft is Posted.
_Avoid_: Attachment, media, image (in the app), file

**Approved**:
A draft the user signed off, with a plan for when it goes out: now or at a set time.
_Avoid_: Scheduled (as a separate state), ready, confirmed

**Due**:
An approved draft whose time has come and that waits for the user's hand-off; a Telegram draft for a connected channel is never due, because the bot posts it at that time.
_Avoid_: Pending, ready to post

**Missed**:
An approved draft whose time passed without it being posted, including one the bot could not send.
_Avoid_: Overdue, failed, expired

**Hand-off**:
Voxlace opens the platform with the draft's text ready and the user presses that platform's own post button; then Voxlace asks "Did you post it?" and marks the draft Posted on yes.
_Avoid_: Share, export, publish

**Posted**:
The draft is out on the platform, whether the user posted it after a hand-off or the bot sent it to their channel.
_Avoid_: Published, sent, live

## The user

**Guest**:
Someone writing drafts without an account; nothing they write is kept.
_Avoid_: Anonymous user, visitor, demo user

**Profile**:
Everything the user told Voxlace about themselves, their work and their audience.
_Avoid_: Settings, account (for this meaning)

**Summary card**:
The facts about the user that drafts are allowed to state, written from the profile and editable by the user.
_Avoid_: Bio, about, facts sheet

**Voice card**:
How the user writes on one platform, learned from their posts and their edits, and kept up to date as they post.
_Avoid_: Persona, style guide, identity card

**Your posts**:
The user's own past posts, imported or posted through Voxlace, that teach the voice.
_Avoid_: Source posts, corpus, history

**Example posts**:
Other creators' posts and the team's templates, used only for the shape of a post, never shown and never a source of facts.
_Avoid_: Inspiration, exemplars, templates

**Own key**:
An AI key the user brings, free or paid, that writes their drafts first and lifts the daily limit.
_Avoid_: API key, BYOK, token, free key (except as a button label for the free providers)
