import { useMutation, useQuery } from '@tanstack/react-query'
import { api } from './client'
import type { ImportJob, Platform } from './types'

/** POST /imports: upload an export. The file is parsed on the server and never stored. */
export function useCreateImport() {
  return useMutation({
    mutationFn: ({ platform, file }: { platform: Platform; file: File }) => {
      const body = new FormData()
      body.append('platform', platform)
      body.append('file', file)
      return api<ImportJob>('/imports', { method: 'POST', body })
    },
  })
}

/** GET /imports/{id}, polled until the posts are learned. */
export function useImport(id: string | undefined) {
  return useQuery({
    queryKey: ['import', id],
    queryFn: () => api<ImportJob>(`/imports/${id}`),
    enabled: Boolean(id),
    refetchInterval: (query) => (query.state.data?.status === 'embedding' ? 3000 : false),
  })
}
