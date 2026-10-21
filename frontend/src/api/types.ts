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
