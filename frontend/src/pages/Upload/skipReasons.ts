import type { SkipReason } from '../../api/types'

/** The user's words for why a message wasn't learned from (DESIGN.md §8: no jargon). */
export const SKIP_LABELS: Record<SkipReason, string> = {
  forwarded: 'forwarded from other channels',
  too_short: 'too short to learn from',
  empty: 'photos or files without text',
  link_only: 'only a link',
  service: 'channel notices (pins, joins)',
  excluded_topic: 'personal topics you excluded',
  duplicate: 'duplicates',
  invalid: 'unreadable',
  already_imported: 'already imported',
}
