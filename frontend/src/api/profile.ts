import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'

/** One of the user's projects; only the name is required (FR-17, FR-40). */
export type Project = {
  name: string
  line: string
  link: string
  status: '' | 'idea' | 'building' | 'live' | 'paused'
}

/** GET /profile (docs/API.md, Phase 3): everything the user told Voxlace. */
export type Profile = {
  role: string
  stack: string
  current_projects: string
  focus: string
  goal: string
  topics: string
  audience: string
  avoid_list: string
  voice_words: string
  links: string
  discipline: string
  usual_hours: string
  language: string
  excluded_hashtags: string[]
  summary_card: string
  summary_updated_at: string | null
  seniority: string
  facts: string
  emoji_habit: string
  hashtag_habit: string
  portfolio_url: string
  projects: Project[]
}

export type ProfileChange = Partial<Omit<Profile, 'summary_updated_at'>>

export function useProfile() {
  return useQuery({ queryKey: ['profile'], queryFn: () => api<Profile>('/profile') })
}

function useProfileMutation<I>(fn: (input: I) => Promise<Profile>) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: (profile) => client.setQueryData(['profile'], profile),
  })
}

/** PUT /profile: send only the fields that change. */
export const useSaveProfile = () =>
  useProfileMutation((change: ProfileChange) =>
    api<Profile>('/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(change),
    }),
  )

/** POST /profile/summary: the AI writes the card from the answers; the user can edit it. */
export const useWriteSummary = () =>
  useProfileMutation((_: void) => api<Profile>('/profile/summary', { method: 'POST' }))
