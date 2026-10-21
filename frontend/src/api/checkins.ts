import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'
import type { Checkin } from './types'

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

/** GET /checkins (FR-6), newest day first. */
export function useCheckins() {
  return useQuery({
    queryKey: ['checkins'],
    queryFn: () => api<{ items: Checkin[] }>('/checkins'),
  })
}

function useCheckinMutation<I, O>(fn: (input: I) => Promise<O>) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => client.invalidateQueries({ queryKey: ['checkins'] }),
  })
}

export const useCreateCheckin = () =>
  useCheckinMutation((input: { text: string; day: string }) =>
    api<Checkin>('/checkins', json('POST', input)),
  )

export const usePatchCheckin = () =>
  useCheckinMutation(({ id, text }: { id: string; text: string }) =>
    api<Checkin>(`/checkins/${id}`, json('PATCH', { text })),
  )

export const useDeleteCheckin = () =>
  useCheckinMutation((id: string) => api<null>(`/checkins/${id}`, { method: 'DELETE' }))
