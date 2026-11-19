import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, json } from './client'

/** docs/API.md, Your AI keys (FR-48). The key itself is never sent back, only its last four. */
export type AIProvider = 'google' | 'groq'

export type AIKey = {
  provider: AIProvider
  last4: string
  status: 'active' | 'rejected'
  last_error: string | null
  added_at: string
  last_used_at: string | null
}

export type AIKeys = {
  enabled: boolean
  providers: { id: AIProvider; name: string; key_url: string; used_for: string }[]
  keys: AIKey[]
}

export function useAIKeys() {
  return useQuery({ queryKey: ['ai-keys'], queryFn: () => api<AIKeys>('/me/ai-keys') })
}

function useKeysMutation<T>(fn: (arg: T) => Promise<unknown>) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['ai-keys'] })
      void client.invalidateQueries({ queryKey: ['usage'] })
    },
  })
}

/** PUT /me/ai-keys/{provider}: checked with the provider, then stored encrypted. */
export const useSaveAIKey = () =>
  useKeysMutation(({ provider, key }: { provider: AIProvider; key: string }) =>
    api<AIKey>(`/me/ai-keys/${provider}`, json('PUT', { key })),
  )

/** DELETE /me/ai-keys/{provider} */
export const useRemoveAIKey = () =>
  useKeysMutation((provider: AIProvider) =>
    api<null>(`/me/ai-keys/${provider}`, { method: 'DELETE' }),
  )
