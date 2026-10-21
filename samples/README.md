# Sample exports

Small, **anonymised** export files used by the parser tests. Never put real exports here (put them in `samples/private/`, which is git-ignored).

These files are **synthetic**: written by hand to mirror each platform's export format, with a fake user ("Sam Builds"), fake IDs and `example.com` / `example.org` links. When your real exports arrive, compare field names and shapes against them and fix these files first if anything differs.

## Expected parser results

Parser tests should assert these numbers.

| File | Entries | Parsed | Skipped |
|---|---|---|---|
| `telegram/result.json` | 8 messages | **5** (ids 2, 3, 6, 7, 8) | 1 service (id 1), 1 empty photo (id 4), 1 forwarded (id 5) |
| `x/tweets.js` + `note-tweet.js` + `account.js` (as a ZIP) | 9 tweets | **7** (…1, …2, …5, …6, the thread …7, the long post …8 with its full text from `note-tweet.js`, the photo post …9 without its photo link) | 1 reply to someone else (…3), 1 repost (…4) |
| `x/tweets.js` alone | 9 tweets | **6** (no `account.js`, so the thread …7 counts as a reply) | 2 replies, 1 repost |
| `linkedin/Shares.csv` | 4 rows | **3** | 1 reshare with no commentary |
| `broken/*` | — | **0** | every file rejected with a readable error, nothing saved (FR-3) |

## Traps the samples contain on purpose

### Telegram (`result.json`, single-chat export from Telegram Desktop)

- `text` is **either a string or a list** of strings and `{type, text}` objects. Flatten the list. `text_entities` has the same content as a flat list.
- `date` is in the **exporter's local time** (UTC+3 here). Use `date_unixtime` (a string) for `posted_at`.
- `text_link` entities keep the visible text in `text` and the URL in `href`.
- Message 3 has `edited` / `edited_unixtime`. Keep the original `date`.
- Message 5 has `forwarded_from`. It's a repost, so skip it (FR-2).
- `external_id` = the message `id` (unique per channel only).

### X (`tweets.js`)

- The file starts with `window.YTD.tweets.part0 = `. Strip everything up to the first `[`.
- Numbers (`favorite_count`, `retweet_count`, IDs) are **strings**. Use `id_str`.
- `full_text` is **HTML-escaped** (`&amp;`, `&lt;`). Unescape it.
- Links are `t.co` short links. Replace each `entities.urls[].url` with its `expanded_url`.
- Replies have `in_reply_to_status_id_str`. Retweets start with `RT @`, and their `retweeted` flag is often `false`.
- `created_at` looks like `Wed Aug 05 18:40:00 +0000 2026`.
- Long Premium posts are cut short in `tweets.js` (under 280, ending in `…` and a link); the full text is in `note-tweet.js`, with no id linking the two. Match on the same second (±2 s) plus the long text starting with the short one.
- Threads are replies to **your own** account id (from `account.js`); keep them and strip the leading `@yourname`.
- Photo and video posts end with a `t.co` link from `entities.media`; remove it.
- Large archives may split tweets into `tweets-part1.js`, …; the importer reads them all.

### LinkedIn (`Shares.csv`)

- Columns: `Date, ShareLink, ShareCommentary, SharedUrl, MediaUrl, Visibility`.
- `ShareCommentary` contains **newlines, commas and doubled quotes** inside quoted fields. Use the `csv` module, not `split`.
- An empty `ShareCommentary` is a reshare with no comment, so skip it.
- `Date` has no time zone. Treat it as UTC (to be confirmed against a real export).
- No native ID, so derive `external_id` from `ShareLink`.

### Broken (`broken/`)

| File | Problem |
|---|---|
| `telegram_truncated.json` | Invalid JSON (cut off) |
| `telegram_no_messages.json` | Valid JSON, wrong shape (no `messages`) |
| `x_no_wrapper.js` | Missing `window.YTD` wrapper and `created_at` |
| `linkedin_wrong_columns.csv` | Valid CSV, wrong columns |
| `empty.json` | Zero bytes |
