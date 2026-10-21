import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'
import type { Draft, DraftDetail, DraftRow, DraftStatus, Platform } from './types'

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

export type DraftOutcome =
  { platform: Platform; ok: true; draft: Draft } | { platform: Platform; ok: false; error: Error }

/**
 * One draft per chosen platform, written in parallel (FR-8). One platform failing (no posts
 * yet, AI busy) never hides the others' drafts. An empty topic writes from the summary card.
 */
export function useGenerateDrafts() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async ({
      platforms,
      topic,
      checkinId,
    }: {
      platforms: Platform[]
      topic: string
      checkinId?: string
    }) => {
      const settled = await Promise.allSettled(
        platforms.map((platform) =>
          api<Draft>(
            '/drafts/generate',
            json('POST', { platform, topic, ...(checkinId && { checkin_id: checkinId }) }),
          ),
        ),
      )
      return settled.map((r, i): DraftOutcome =>
        r.status === 'fulfilled'
          ? { platform: platforms[i], ok: true, draft: r.value }
          : { platform: platforms[i], ok: false, error: r.reason as Error },
      )
    },
    onSettled: () => client.invalidateQueries({ queryKey: ['drafts'] }),
  })
}

export type DraftFilter = {
  status?: DraftStatus
  platform?: Platform
  scheduled_from?: string
  scheduled_to?: string
  created_from?: string
}

/** GET /drafts: the library, Home's "today" and the calendar's range. */
export function useDrafts(filter: DraftFilter) {
  const params = new URLSearchParams(
    Object.entries(filter).filter((e): e is [string, string] => Boolean(e[1])),
  )
  return useQuery({
    queryKey: ['drafts', 'list', filter],
    queryFn: () => api<{ items: DraftRow[] }>(`/drafts?${params}`),
  })
}

export function useDraft(id: string) {
  return useQuery({
    queryKey: ['drafts', 'one', id],
    queryFn: () => api<DraftDetail>(`/drafts/${id}`),
  })
}

/** Every change returns the whole draft: put it in the cache, refresh the lists. */
function useDraftMutation<I>(id: string, fn: (input: I) => Promise<DraftDetail>) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: (draft) => {
      client.setQueryData(['drafts', 'one', id], draft)
      void client.invalidateQueries({ queryKey: ['drafts', 'list'] })
    },
  })
}

export type DraftChange = { text?: string; status?: DraftStatus; scheduled_for?: string | null }

/** PATCH /drafts/{id}: hand edit, approve, schedule, Posted, discard (docs/API.md rules). */
export const usePatchDraft = (id: string) =>
  useDraftMutation(id, (change: DraftChange) =>
    api<DraftDetail>(`/drafts/${id}`, json('PATCH', change)),
  )

/** POST /drafts/{id}/revise: the chat (FR-10, FR-40). */
export const useReviseDraft = (id: string) =>
  useDraftMutation(id, (input: { instruction: string; selection?: string }) =>
    api<DraftDetail>(`/drafts/${id}/revise`, json('POST', input)),
  )

export const useRestoreVersion = (id: string) =>
  useDraftMutation(id, (versionId: string) =>
    api<DraftDetail>(`/drafts/${id}/versions/${versionId}/restore`, { method: 'POST' }),
  )

/** PATCH from a list row (the calendar's drag and Posted), by any id. */
export function usePatchAnyDraft() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...change }: DraftChange & { id: string }) =>
      api<DraftDetail>(`/drafts/${id}`, json('PATCH', change)),
    onSuccess: (draft) => {
      client.setQueryData(['drafts', 'one', draft.id], draft)
      void client.invalidateQueries({ queryKey: ['drafts', 'list'] })
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

/**
 * Approved posts whose time has come and that aren't marked posted yet (FR-35, in the app).
 * Checked once a minute; the bell and the calendar's "Due now" both read it.
 */
export function useDuePosts() {
  return useQuery({
    queryKey: ['drafts', 'list', 'due'],
    queryFn: () =>
      api<{ items: DraftRow[] }>(
        `/drafts?status=approved&scheduled_to=${encodeURIComponent(new Date().toISOString())}`,
      ),
    refetchInterval: 60_000,
  })
}
