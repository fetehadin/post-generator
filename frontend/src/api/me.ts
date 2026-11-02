import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, json } from './client'
import type { Notifications, Reminders } from './types'

/** GET /me (docs/API.md, Phase 2; `timezone` since SRS 1.3, default "UTC"). */
export type Me = {
  id: string
  email: string
  admitted: boolean
  privacy_accepted: boolean
  timezone?: string
}

export function useMe(enabled = true) {
  return useQuery({ queryKey: ['me'], queryFn: () => api<Me>('/me'), enabled, retry: false })
}

function useMeMutation<I>(fn: (input: I) => Promise<Me>) {
  const client = useQueryClient()
  return useMutation({ mutationFn: fn, onSuccess: (me) => client.setQueryData(['me'], me) })
}

export const useRedeemInvite = () =>
  useMeMutation((code: string) => api<Me>('/me/invite', json('POST', { code })))

export const useAcceptPrivacy = () =>
  useMeMutation((_: void) => api<Me>('/me/privacy-accept', { method: 'POST' }))

/** PATCH /me: the user's IANA time zone. Stored times stay UTC (NFR-16). */
export function useSetTimezone() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (timezone: string) => api<Me>('/me', json('PATCH', { timezone })),
    onSuccess: (me) => {
      client.setQueryData(['me'], me)
      // Best hours, reminders and "today" are all on the user's clock.
      for (const key of ['best-hours', 'notifications', 'drafts', 'threads', 'checkins'])
        void client.invalidateQueries({ queryKey: [key] })
    },
  })
}

/**
 * GET /me/notifications, once a minute (FR-35, FR-42): posts due now, missed posts and the
 * check-in reminder. The one poller: the bell, the right panel and the calendar's "Due now"
 * all read it, so they always agree.
 */
export function useNotifications(enabled = true) {
  return useQuery({
    queryKey: ['notifications'],
    queryFn: () => api<Notifications>('/me/notifications'),
    refetchInterval: 60_000,
    enabled,
  })
}

export function useReminders() {
  return useQuery({ queryKey: ['reminders'], queryFn: () => api<Reminders>('/me/reminders') })
}

export function useSaveReminders() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (r: Reminders) => api<Reminders>('/me/reminders', json('PUT', r)),
    onSuccess: (r) => {
      client.setQueryData(['reminders'], r)
      void client.invalidateQueries({ queryKey: ['notifications'] })
    },
  })
}
