/**
 * Response shapes from docs/API.md (Phase 1). Written by hand until `npm run gen:api`
 * generates them from the backend's OpenAPI schema; keep them in step with the doc.
 */

export type Platform = 'telegram' | 'x' | 'linkedin'

export type SkipReason =
  | 'service'
  | 'forwarded'
  | 'empty'
  | 'too_short'
  | 'link_only'
  | 'excluded_topic'
  | 'duplicate'
  | 'invalid'
  | 'already_imported'
  | 'reply'
  | 'repost'

export type ImportJob = {
  id: string
  platform: Platform
  status: 'parsing' | 'embedding' | 'done' | 'failed'
  parsed: number
  skipped: Partial<Record<SkipReason, number>>
  embedded: number
  waiting: number
  /** X only, on upload: a recent post over 280 suggests Premium (OPEN_QUESTIONS Q31). */
  premium_hint?: boolean | null
}

export type Draft = {
  id: string
  platform: Platform
  status: 'draft' | 'approved' | 'published' | 'discarded'
  text: string
  length: { count: number; limit: number; over: boolean }
  model: string | null
  examples_used: number
  created_at: string
}

export type Post = {
  id: string
  platform: Platform
  text: string
  posted_at: string
  likes: number
  pinned: boolean
  excluded: boolean
  embedded: boolean
}

export type PostsPage = { items: Post[]; next_cursor: string | null }

export type DraftStatus = 'draft' | 'approved' | 'published' | 'discarded'

/** A row of GET /drafts: the library, Home's list and the calendar (docs/API.md, Phase 4). */
export type DraftRow = {
  id: string
  platform: Platform
  status: DraftStatus
  text: string
  length: { count: number; limit: number; over: boolean }
  scheduled_for: string | null
  published_at: string | null
  created_at: string
  updated_at: string
  /** The chat thread the draft lives in (SRS 1.3); null for drafts from before threads. */
  thread_id?: string | null
}

export type DraftVersion = {
  id: string
  number: number
  text: string
  instruction: string | null
  created_at: string
}

export type DraftMessage = {
  id: string
  role: 'user' | 'assistant'
  text: string
  version_id: string | null
  created_at: string
}

/** GET /drafts/{id}: the editor's data. */
export type DraftDetail = DraftRow & {
  topic: string
  checkin_id: string | null
  versions: DraftVersion[]
  messages: DraftMessage[]
}

export type Checkin = {
  id: string
  day: string
  text: string
  created_at: string
  updated_at: string
}

// ---- Chat board, notifications and time zone (docs/API.md, SRS 1.3) ----

export type Length = { count: number; limit: number; over: boolean }

/** A row of GET /threads: the sidebar's chat history, last touched first. */
export type ThreadRow = { id: string; title: string; platforms: Platform[]; updated_at: string }

/** A draft version shown as a card in the thread. */
export type ThreadCard = { version_id: string; number: number; text: string; length: Length }

export type ThreadMessage = {
  id: string
  role: 'user' | 'assistant'
  text: string
  draft_id: string | null
  /** Set when this message is a draft version; every change that alters the text adds one. */
  card: ThreadCard | null
  created_at: string
}

/** A platform that couldn't be written; the others still arrive (POST /threads/{id}/generate). */
export type GenerateFailure = { platform: Platform; code: string; message: string }

export type Thread = {
  id: string
  title: string
  checkin_id: string | null
  checkin_text: string
  created_at: string
  updated_at: string
  messages: ThreadMessage[]
  drafts: DraftRow[]
  failures?: GenerateFailure[]
}

/** POST /drafts/{id}/schedule: approved and on the calendar at the picked (or given) time. */
export type ScheduleResult = {
  draft: DraftRow
  scheduled_for: string
  /** Its place in that day's order for the platform: 1 = first. */
  rank: number
  reason: string
  warning: string | null
}

/** GET /me/notifications, asked every minute. Nothing is ever sent by the server. */
export type Notifications = { due: DraftRow[]; missed: DraftRow[]; checkin_reminder: boolean }

/** GET/PUT /me/reminders: days 0 (Monday) to 6; local_time on the user's own clock. */
export type Reminders = { enabled: boolean; days: number[]; local_time: string }

/** GET /platforms/{platform}/best-hours: each day's 24 scores, best = 1.0. */
export type BestHours = {
  platform: Platform
  timezone: string
  source: 'studies' | 'your_posts'
  days: Array<{ date: string; scores: number[]; best: number[] }>
}

export type AudienceProfession = 'general' | 'developers' | 'business' | 'students' | 'creatives'

/** One place the audience lives: an IANA time zone and a share (1–100, weighed together). */
export type AudiencePlace = { timezone: string; share: number }
