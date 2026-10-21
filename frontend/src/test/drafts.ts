import type { DraftDetail, DraftRow, Platform } from '../api/types'

export const row = (over: Partial<DraftRow> = {}): DraftRow => ({
  id: 'd1',
  platform: 'telegram',
  status: 'draft',
  text: 'Small win today: the importer works.\nMore soon.',
  length: { count: 47, limit: 4096, over: false },
  scheduled_for: null,
  published_at: null,
  created_at: '2026-10-22T09:00:00Z',
  updated_at: '2026-10-22T09:00:00Z',
  ...over,
})

export const detail = (over: Partial<DraftDetail> = {}): DraftDetail => {
  const base = row(over)
  return {
    ...base,
    topic: 'Finished the importer',
    checkin_id: null,
    versions: [
      { id: 'v1', number: 1, text: base.text, instruction: null, created_at: base.created_at },
    ],
    messages: [],
    ...over,
  }
}

export const generated = (platform: Platform) => ({
  id: `d-${platform}`,
  platform,
  status: 'draft' as const,
  text: 'Small win today.',
  length: { count: 16, limit: 4096, over: false },
  model: 'm',
  examples_used: 8,
  created_at: '2026-10-22T09:00:00Z',
})
