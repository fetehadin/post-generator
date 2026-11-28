# Pictures live on the draft until it is posted

Users want a picture with some posts. We decided that a picture belongs to **one draft** (not to the chat, not to a version) and is kept on the server's own disk only **until that draft is Posted**, deleted or discarded; then the file is deleted. Telegram drafts go out with their pictures through the bot; X and LinkedIn can't be posted to by Voxlace, so their hand-off copies the picture for the user to paste. The AI never sees a picture: drafts state only facts the user typed (rule 10).

## Considered options

- **Per chat** (one picture shared by the chat's X, LinkedIn and Telegram drafts): fewer uploads, but the platforms want different crops and counts, and "remove it from just this one" adds rules. Rejected.
- **Per draft (chosen):** simple ownership, simple delete. Uploading the same picture to two drafts is a second upload; acceptable.
- **Object storage (S3 or similar):** a new paid service (NFR-1). Rejected; the VPS disk is enough for short-lived pictures.
- **Keep pictures after posting** (for history or "Your posts"): costs disk and holds personal images we don't need. Rejected: deleted once posted.
- **The AI describes the picture:** risks invented facts. Rejected; the user writes the one line they want said about it.

## Consequences

- New table `draft_pictures` with `user_id` and RLS; files under one server folder, never at a public address. The API serves them only to their owner, and the bot uploads the file itself to Telegram.
- Every upload is re-encoded, which drops hidden data such as a phone photo's GPS location. This needs the Pillow library, a new dependency.
- A Telegram draft with pictures goes out in **one** Bot API call (`sendPhoto`, or `sendMediaGroup` for 2–4), with the text as the caption, so the exactly-once send (ADR 0001) still holds. Telegram allows 1,024 caption characters, so a Telegram draft with a picture is limited to 1,024, not 4,096.
- Pictures are deleted when the draft becomes Posted (bot send or "Yes, mark as posted"), is discarded or deleted, or its account is deleted. A sweep removes any file with no row. They are not in the nightly backup: a lost picture is attached again.
- The production compose file needs a volume for the folder (a `deploy/` change, asked for separately).
