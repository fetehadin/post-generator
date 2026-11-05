import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, json } from './client'
import type { Platform, Thread } from './types'

/**
 * Guest mode (FR-47; docs/API.md "Guest mode"): draft without logging in. The server keeps
 * nothing; each draft comes with a signed receipt that we keep in this browser, and that
 * POST /threads/claim turns into a saved chat once the guest logs in.
 */
export type GuestDraft = {
  platform: Platform
  text: string
  length: { count: number; limit: number; over: boolean }
  receipt: string
}

export type GuestDrafts = {
  drafts: GuestDraft[]
  failures: { platform: Platform; code: string; message: string }[]
}

export type GuestRevision = { draft: GuestDraft | null; question: string | null }

export function useGuestWrite() {
  return useMutation({
    mutationFn: (body: { topic: string; platforms: Platform[] }) =>
      api<GuestDrafts>('/guest/drafts', json('POST', body)),
  })
}

export function useGuestRevise() {
  return useMutation({
    mutationFn: (body: { receipt: string; instruction: string }) =>
      api<GuestRevision>('/guest/revise', json('POST', body)),
  })
}

/** After login: the guest's drafts become one chat in the account. */
export function useClaimGuest() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (receipts: string[]) => api<Thread>('/threads/claim', json('POST', { receipts })),
    onSuccess: (thread) => {
      client.setQueryData(['threads', 'one', thread.id], thread)
      void client.invalidateQueries({ queryKey: ['threads', 'list'] })
      void client.invalidateQueries({ queryKey: ['drafts'] })
    },
  })
}
