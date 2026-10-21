import { useMutation, useQuery } from '@tanstack/react-query'
import { api } from './client'
import type { Draft, Platform } from './types'

/** POST /drafts/generate. On 429/503 the caller keeps the user's topic in the form. */
export function useGenerateDraft() {
  return useMutation({
    mutationFn: (input: { platform: Platform; topic: string }) =>
      api<Draft>('/drafts/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }),
  })
}

export type DraftOutcome =
  { platform: Platform; ok: true; draft: Draft } | { platform: Platform; ok: false; error: Error }

/**
 * One draft per chosen platform, written in parallel (FR-8). One platform failing (no posts
 * yet, AI busy) never hides the others' drafts.
 */
export function useGenerateDrafts() {
  return useMutation({
    mutationFn: async ({ platforms, topic }: { platforms: Platform[]; topic: string }) => {
      const settled = await Promise.allSettled(
        platforms.map((platform) =>
          api<Draft>('/drafts/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ platform, topic }),
          }),
        ),
      )
      return settled.map((r, i): DraftOutcome =>
        r.status === 'fulfilled'
          ? { platform: platforms[i], ok: true, draft: r.value }
          : { platform: platforms[i], ok: false, error: r.reason as Error },
      )
    },
  })
}

export type PromptLog = {
  prompt: string
  model: string
  model_version: string | null
  provider: string
}

/** GET /drafts/{id}/prompt: the exact prompt behind a draft (developer view only). */
export function useDraftPrompt(id: string, enabled: boolean) {
  return useQuery({
    queryKey: ['draft-prompt', id],
    queryFn: () => api<PromptLog>(`/drafts/${id}/prompt`),
    enabled,
  })
}
