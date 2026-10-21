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
