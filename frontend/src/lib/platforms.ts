import type { Platform } from '../api/types'
import type { CountingRule } from './xCount'

export const LABEL: Record<Platform, string> = {
  x: 'X',
  linkedin: 'LinkedIn',
  telegram: 'Telegram',
}

/** The counting rule per platform, for live counting while typing. The server's limit wins. */
export const RULES: Record<Platform, CountingRule> = {
  telegram: 'plain',
  x: 'x_weighted',
  linkedin: 'plain',
}

export const STATUS_LABEL = {
  draft: 'Draft',
  approved: 'Approved',
  published: 'Posted',
  discarded: 'Discarded',
} as const
