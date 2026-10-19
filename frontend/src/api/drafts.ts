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
