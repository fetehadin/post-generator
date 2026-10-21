import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'

/** GET /me/usage (FR-30). */
export type Usage = {
  drafts: number
  draft_limit: number
  posts: number
  post_limit: number
  resets_at: string
}

export function useUsage() {
  return useQuery({ queryKey: ['usage'], queryFn: () => api<Usage>('/me/usage') })
}

/** GET /drafts/stats (FR-15): the last 7 days. */
export type DraftStats = {
  created: number
  published: number
  publish_rate: number | null
  edited: number | null
}

export function useDraftStats() {
  return useQuery({
    queryKey: ['drafts', 'stats'],
    queryFn: () => api<DraftStats>('/drafts/stats'),
  })
}

/** GET /me/export (FR-38): fetched with the login token, then saved as a file. */
export async function downloadExport(): Promise<void> {
  const data = await api<unknown>('/me/export')
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `voxlace-export-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

/** DELETE /me (FR-38, NFR-10). The caller logs out afterwards. */
export function useDeleteAccount() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (confirm: string) =>
      api<null>('/me', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm }),
      }),
    onSuccess: () => client.clear(),
  })
}
