import { useQuery } from '@tanstack/react-query'
import { api } from './client'

/** GET /health (docs/API.md). Each part reports "ok" or a short problem. */
export type Health = { api: string; db: string }

export function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: () => api<Health>('/health'),
    refetchInterval: 15_000,
    retry: false,
  })
}
