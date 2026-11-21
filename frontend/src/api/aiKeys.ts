import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, json } from './client'

/** docs/API.md, Your AI keys (FR-48). The key itself is never sent back, only its last four. */
export type AIProvider = 'google' | 'groq' | 'openai' | 'anthropic' | 'openrouter' | 'mistral'

export type AIKey = {
  provider: AIProvider
  last4: string
  /** e.g. "sk-…a9F2": all the app ever shows of a key. */
  masked: string
  /** The model it writes with; null = the provider's default. */
  model: string | null
  status: 'active' | 'rejected'
  last_error: string | null
  added_at: string
  last_used_at: string | null
}

export type AIProviderInfo = {
  id: AIProvider
  name: string
  key_url: string
  used_for: string
  default_model: string
  /** A regex every key from this provider matches; '' = keys of any shape. */
  prefix: string
  /** How its keys start, e.g. "AIza". */
  hint: string
  /** Has a free tier: shown as a "Get free key" card. */
  free: boolean
  steps: string[]
  note: string
}

export type AIKeys = {
  enabled: boolean
  providers: AIProviderInfo[]
  keys: AIKey[]
}

/** The provider a pasted key belongs to, from how it starts (prefixes come from the API). */
export function detectProvider(key: string, providers: AIProviderInfo[]) {
  const k = key.trim()
  return providers.find((p) => p.prefix && new RegExp(p.prefix).test(k))
}

/** The user's working key the drafts use first, if any (keys come newest first). */
export function activeKey(data: AIKeys | undefined) {
  const key = data?.keys.find((k) => k.status === 'active')
  return key && { key, provider: data?.providers.find((p) => p.id === key.provider) }
}

export function useAIKeys() {
  return useQuery({ queryKey: ['ai-keys'], queryFn: () => api<AIKeys>('/me/ai-keys') })
}

function useKeysMutation<T, R>(fn: (arg: T) => Promise<R>) {
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
  useKeysMutation(
    ({ provider, key, model }: { provider: AIProvider; key: string; model?: string }) =>
      api<AIKey>(`/me/ai-keys/${provider}`, json('PUT', { key, model: model || null })),
  )

/** DELETE /me/ai-keys/{provider} */
export const useRemoveAIKey = () =>
  useKeysMutation((provider: AIProvider) =>
    api<null>(`/me/ai-keys/${provider}`, { method: 'DELETE' }),
  )
