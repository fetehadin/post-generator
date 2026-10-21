import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from './client'
import type { Platform, Post, PostsPage } from './types'

export type PostFilter = { platform: Platform; q: string; show: 'all' | 'pinned' | 'excluded' }

/** GET /posts, newest first, a page at a time (docs/API.md). */
export function usePosts({ platform, q, show }: PostFilter) {
  return useInfiniteQuery({
    queryKey: ['posts', platform, q, show],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ platform, show, limit: '30' })
      if (q.trim()) params.set('q', q.trim())
      if (pageParam) params.set('cursor', pageParam)
      return api<PostsPage>(`/posts?${params}`)
    },
    initialPageParam: '' as string,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  })
}

/** PATCH /posts/{id}: pin (always an example) or exclude (never one). FR-25. */
export function usePatchPost() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...change }: { id: string; pinned?: boolean; excluded?: boolean }) =>
      api<Post>(`/posts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(change),
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['posts'] }),
  })
}
