import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'
import type { Platform } from './types'

/** GET /platforms/{platform} (docs/API.md, Phase 3): one Profile tab's rules, voice and settings. */
export type PlatformInfo = {
  platform: Platform
  rules: { char_limit: number; counting_rule: string; tone_notes: string; structure_notes: string }
  effective_limit: number
  stats: {
    post_count: number
    thin: boolean
    median_length: number
    median_lines: number
    emoji_share: number
    hashtag_share: number
    link_share: number
    question_share: number
    ethiopic_share: number
    top_hashtags: string[]
  }
  voice_card: string
  voice_card_updated_at: string | null
  x_premium: boolean | null
  premium_source: 'user' | 'export' | null
}

export function usePlatform(platform: Platform) {
  return useQuery({
    queryKey: ['platform', platform],
    queryFn: () => api<PlatformInfo>(`/platforms/${platform}`),
  })
}

function usePlatformMutation<I>(platform: Platform, fn: (input: I) => Promise<PlatformInfo>) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: (info) => client.setQueryData(['platform', platform], info),
  })
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

/** PUT: the user's own edit of the voice card. */
export const useSaveVoiceCard = (platform: Platform) =>
  usePlatformMutation(platform, (voice_card: string) =>
    api<PlatformInfo>(`/platforms/${platform}/voice-card`, json('PUT', { voice_card })),
  )

/** POST: the AI rewrites the card from the posts; hand-edited lines stay (FR-26). */
export const useWriteVoiceCard = (platform: Platform) =>
  usePlatformMutation(platform, () =>
    api<PlatformInfo>(`/platforms/${platform}/voice-card`, { method: 'POST' }),
  )

/** PUT: X Premium yes/no (Q31). */
export const useSetPremium = () =>
  usePlatformMutation('x', (x_premium: boolean) =>
    api<PlatformInfo>('/platforms/x/settings', json('PUT', { x_premium })),
  )
