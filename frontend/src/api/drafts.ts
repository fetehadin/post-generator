import { useMutation } from '@tanstack/react-query'
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
