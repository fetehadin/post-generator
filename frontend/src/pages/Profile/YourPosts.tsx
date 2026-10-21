import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { usePatchPost, usePosts, type PostFilter } from '../../api/posts'
import type { Platform, Post } from '../../api/types'

const TABS: Array<{ id: Platform; label: string }> = [
  { id: 'telegram', label: 'Telegram' },
  { id: 'x', label: 'X' },
  { id: 'linkedin', label: 'LinkedIn' },
]
const SHOW: Array<{ id: PostFilter['show']; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'pinned', label: 'Pinned' },
  { id: 'excluded', label: 'Excluded' },
]
const day = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

/** Profile → your previous posts, per platform: search, pin and exclude (FR-25). */
export function YourPosts() {
  const [platform, setPlatform] = useState<Platform>('telegram')
  const [typed, setTyped] = useState('')
  const [q, setQ] = useState('')
  const [show, setShow] = useState<PostFilter['show']>('all')
  useEffect(() => {
    const t = setTimeout(() => setQ(typed), 300) // search after a short pause in typing
    return () => clearTimeout(t)
  }, [typed])

  const posts = usePosts({ platform, q, show })
  const items = posts.data?.pages.flatMap((p) => p.items) ?? []
  const label = TABS.find((t) => t.id === platform)!.label

  return (
    <div>
      <div role="tablist" aria-label="Platform" className="flex gap-1 border-b border-line">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={platform === t.id}
            onClick={() => setPlatform(t.id)}
            className={`-mb-px min-h-10 border-b-2 px-3 text-sm ${
              platform === t.id ? 'border-thread font-semibold' : 'border-transparent text-muted'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <label htmlFor="post-search" className="sr-only">
          Search your {label} posts
        </label>
        <input
          id="post-search"
          type="search"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={`Search your ${label} posts`}
          className="min-h-10 flex-1 rounded-control border border-edge bg-surface px-3 text-sm"
        />
        <div role="group" aria-label="Show" className="flex gap-1">
          {SHOW.map((s) => (
            <button
              key={s.id}
              type="button"
              aria-pressed={show === s.id}
              onClick={() => setShow(s.id)}
              className={`min-h-10 rounded-full border px-3 text-sm ${
                show === s.id ? 'border-thread bg-thread-soft' : 'border-edge'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <p className="mt-3 text-xs text-muted">
        Pinned posts are always used as examples of your voice; excluded ones never are.
      </p>

      {posts.isPending && <p className="mt-6 text-muted">Loading…</p>}
      {posts.isError && (
        <p role="alert" className="mt-6 text-danger">
          {posts.error.message}
        </p>
      )}
      {posts.isSuccess && items.length === 0 && (
        <p className="mt-6 text-muted">
          {q || show !== 'all' ? (
            'No posts match.'
          ) : (
            <>
              No {label} posts yet.{' '}
              <Link to="/import" className="text-thread underline underline-offset-4">
                Import your {label} posts
              </Link>
            </>
          )}
        </p>
      )}

      <ul className="mt-4">
        {items.map((p) => (
          <PostRow key={p.id} post={p} />
        ))}
      </ul>

      {posts.hasNextPage && (
        <button
          type="button"
          onClick={() => posts.fetchNextPage()}
          disabled={posts.isFetchingNextPage}
          className="mt-4 min-h-10 rounded-control border border-edge px-4 text-sm"
        >
          {posts.isFetchingNextPage ? 'Loading…' : 'Load more'}
        </button>
      )}
    </div>
  )
}

function PostRow({ post }: { post: Post }) {
  const patch = usePatchPost()
  const start = post.text.slice(0, 40)
  return (
    <li className="border-t border-line py-4">
      <p className="text-xs text-muted">
        {day.format(new Date(post.posted_at))}
        {post.likes > 0 && ` · ${post.likes} likes`}
        {post.pinned && ' · Pinned'}
        {post.excluded && ' · Excluded'}
      </p>
      <p
        className={`mt-1 line-clamp-4 font-serif whitespace-pre-line ${post.excluded ? 'text-muted' : ''}`}
      >
        {post.text}
      </p>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          aria-pressed={post.pinned}
          aria-label={`${post.pinned ? 'Unpin' : 'Pin'}: ${start}`}
          onClick={() => patch.mutate({ id: post.id, pinned: !post.pinned })}
          className="min-h-8 rounded-control px-2 text-sm text-thread hover:bg-sunken"
        >
          {post.pinned ? 'Unpin' : 'Pin'}
        </button>
        <button
          type="button"
          aria-pressed={post.excluded}
          aria-label={`${post.excluded ? 'Include again' : 'Exclude'}: ${start}`}
          onClick={() => patch.mutate({ id: post.id, excluded: !post.excluded })}
          className="min-h-8 rounded-control px-2 text-sm text-muted hover:bg-sunken"
        >
          {post.excluded ? 'Include again' : 'Exclude'}
        </button>
      </div>
      {patch.isError && (
        <p role="alert" className="text-sm text-danger">
          {patch.error.message}
        </p>
      )}
    </li>
  )
}
