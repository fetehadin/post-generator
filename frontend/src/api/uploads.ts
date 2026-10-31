import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'

/** A resume or portfolio page as cleaned text (docs/API.md, Uploads; FR-20, FR-21). */
export type Upload = {
  id: string
  kind: 'resume' | 'portfolio'
  source: string
  text: string
  removed: Partial<Record<'emails' | 'phones' | 'addresses', number>>
  reviewed: boolean
  created_at: string
  updated_at: string
}

export function useUploads() {
  return useQuery({
    queryKey: ['uploads'],
    queryFn: () => api<{ items: Upload[] }>('/uploads'),
    select: (data) => data.items,
  })
}

function useUploadsMutation<I, O>(fn: (input: I) => Promise<O>) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => client.invalidateQueries({ queryKey: ['uploads'] }),
  })
}

/** POST /uploads/resume: a PDF or DOCX. The file is read on the server and never kept. */
export const useUploadResume = () =>
  useUploadsMutation((file: File) => {
    const body = new FormData()
    body.append('file', file)
    return api<Upload>('/uploads/resume', { method: 'POST', body })
  })

/** POST /uploads/portfolio: a public page; the server checks the address. */
export const useAddPortfolio = () =>
  useUploadsMutation((url: string) =>
    api<Upload>('/uploads/portfolio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    }),
  )

/** PATCH /uploads/{id}: edit the text and/or mark it reviewed. */
export const useEditUpload = () =>
  useUploadsMutation(({ id, ...change }: { id: string; text?: string; reviewed?: boolean }) =>
    api<Upload>(`/uploads/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(change),
    }),
  )

/** DELETE /uploads/{id}. */
export const useDeleteUpload = () =>
  useUploadsMutation((id: string) => api<null>(`/uploads/${id}`, { method: 'DELETE' }))
