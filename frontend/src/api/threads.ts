import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, json } from './client'
import type { Platform, ScheduleResult, Thread, ThreadRow } from './types'

/**
 * The chat board (FR-40, FR-46; docs/API.md "Threads"). A thread is one conversation: the
 * day's check-in, the drafts made from it and every revision, as cards in order.
 */

/** GET /threads: the sidebar's history, last touched first (50 at most). */
export function useThreads() {
  return useQuery({
    queryKey: ['threads', 'list'],
    queryFn: () => api<{ items: ThreadRow[] }>('/threads'),
  })
}

/**
 * Chat actions (FR-55). PATCH /threads/{id} renames, pins or archives; POST …/title has the AI
 * name the chat; DELETE removes it and its unapproved drafts (approved and scheduled ones stay,
 * so the draft lists and the calendar refresh too).
 */
function useChatAction<I, O>(fn: (input: I) => Promise<O>) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['threads'] })
      void client.invalidateQueries({ queryKey: ['drafts'] })
    },
  })
}

export const useUpdateThread = () =>
  useChatAction(
    ({ id, ...change }: { id: string; title?: string; pinned?: boolean; archived?: boolean }) =>
      api<ThreadRow>(`/threads/${id}`, json('PATCH', change)),
  )

export const useRetitleThread = () =>
  useChatAction((id: string) => api<ThreadRow>(`/threads/${id}/title`, { method: 'POST' }))

export const useDeleteThread = () =>
  useChatAction((id: string) =>
    api<{ kept_drafts: number }>(`/threads/${id}`, { method: 'DELETE' }),
  )

export function useThread(id: string | undefined) {
  return useQuery({
    queryKey: ['threads', 'one', id],
    queryFn: () => api<Thread>(`/threads/${id}`),
    enabled: Boolean(id),
  })
}

/**
 * Every thread change returns the whole thread: cache it, and refresh the history, the draft
 * lists and the calendar, which show the same drafts.
 */
function useThreadMutation<I>(fn: (input: I) => Promise<Thread>) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: (thread) => {
      client.setQueryData(['threads', 'one', thread.id], thread)
      void client.invalidateQueries({ queryKey: ['threads', 'list'] })
      void client.invalidateQueries({ queryKey: ['drafts'] })
    },
  })
}

/** POST /threads: start a chat with today's check-in (Save). */
export const useCreateThread = () =>
  useThreadMutation((input: { text: string; day?: string }) =>
    api<Thread>('/threads', json('POST', input)),
  )

/**
 * POST /threads/{id}/generate: one card per platform; failures come back per platform.
 * `signal` stops waiting (Stop); the server may still finish, and the cards then appear.
 */
export const useGenerateInThread = () =>
  useThreadMutation(
    ({
      threadId,
      platforms,
      signal,
    }: {
      threadId: string
      platforms: Platform[]
      signal?: AbortSignal
    }) => api<Thread>(`/threads/${threadId}/generate`, { ...json('POST', { platforms }), signal }),
  )

/** POST /drafts/{id}/convert: "Make an X version" as a new draft in the same thread. */
export const useConvertDraft = () =>
  useThreadMutation(({ draftId, platform }: { draftId: string; platform: Platform }) =>
    api<Thread>(`/drafts/${draftId}/convert`, json('POST', { platform })),
  )

/**
 * POST /drafts/{id}/schedule (FR-45): approve and put it on `day` (the user's date). With no
 * `at`, the app picks the best free hour and says why.
 */
export function useScheduleDraft() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ draftId, day, at }: { draftId: string; day: string; at?: string }) =>
      api<ScheduleResult>(`/drafts/${draftId}/schedule`, json('POST', { day, at: at ?? null })),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['threads'] })
      void client.invalidateQueries({ queryKey: ['drafts'] })
      void client.invalidateQueries({ queryKey: ['notifications'] })
    },
  })
}

/** DELETE /drafts/{id}: "Delete forever", only for a discarded draft (else 409). */
export function useDeleteDraft() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (draftId: string) => api<void>(`/drafts/${draftId}`, { method: 'DELETE' }),
    onSuccess: (_, draftId) => {
      // It's gone: drop its own query rather than refetching it into a 404.
      client.removeQueries({ queryKey: ['drafts', 'one', draftId] })
      void client.invalidateQueries({ queryKey: ['drafts', 'list'] })
      void client.invalidateQueries({ queryKey: ['threads'] })
    },
  })
}
