import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'

/** GET /me (docs/API.md, Phase 2). */
export type Me = { id: string; email: string; admitted: boolean; privacy_accepted: boolean }

export function useMe(enabled = true) {
  return useQuery({ queryKey: ['me'], queryFn: () => api<Me>('/me'), enabled, retry: false })
}

function useMeMutation<I>(fn: (input: I) => Promise<Me>) {
  const client = useQueryClient()
  return useMutation({ mutationFn: fn, onSuccess: (me) => client.setQueryData(['me'], me) })
}

export const useRedeemInvite = () =>
  useMeMutation((code: string) =>
    api<Me>('/me/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    }),
  )

export const useAcceptPrivacy = () =>
  useMeMutation((_: void) => api<Me>('/me/privacy-accept', { method: 'POST' }))
