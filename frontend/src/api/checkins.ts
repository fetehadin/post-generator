import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, json } from './client'
import type { Checkin } from './types'

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
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['checkins'] })
      // A chat opens with its check-in, so the chats show the change too.
      void client.invalidateQueries({ queryKey: ['threads'] })
    },
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
