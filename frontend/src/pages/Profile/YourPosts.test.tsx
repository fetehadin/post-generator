import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, vi } from 'vitest'
import { api } from '../../api/client'
import type { Post } from '../../api/types'
import { YourPosts } from './YourPosts'

vi.mock('../../api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/client')>()),
  api: vi.fn(),
}))

beforeEach(() => vi.clearAllMocks())

const post = (over: Partial<Post> = {}): Post => ({
  id: 'p1',
  platform: 'telegram',
  text: 'Ship log: fixed the timezone bug. Everything is UTC now.',
  posted_at: '2026-09-02T14:10:00Z',
  likes: 14,
  pinned: false,
  excluded: false,
  embedded: true,
  ...over,
})

function renderPosts() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <YourPosts />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const urls = () => vi.mocked(api).mock.calls.map((c) => String(c[0]))

test('lists your posts with likes, and Pin sends PATCH', async () => {
  vi.mocked(api).mockImplementation(async (_path, init) =>
    init?.method === 'PATCH' ? post({ pinned: true }) : { items: [post()], next_cursor: null },
  )
  renderPosts()
  expect(await screen.findByText(/fixed the timezone bug/)).toBeInTheDocument()
  expect(screen.getByText(/14 likes/)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: /^Pin: Ship log/ }))
  const patch = vi.mocked(api).mock.calls.find((c) => c[1]?.method === 'PATCH')!
  expect(patch[0]).toBe('/posts/p1')
  expect(JSON.parse(String(patch[1]?.body))).toEqual({ pinned: true })
})

test('platform tabs, search and the filter reach the API', async () => {
  vi.mocked(api).mockResolvedValue({ items: [], next_cursor: null })
  renderPosts()
  await userEvent.click(screen.getByRole('tab', { name: 'X' }))
  await userEvent.click(screen.getByRole('button', { name: 'Pinned' }))
  await userEvent.type(screen.getByLabelText('Search your X posts'), 'utc')
  await screen.findByText('No posts match.')
  await vi.waitFor(() => expect(urls().at(-1)).toContain('q=utc'))
  expect(urls().at(-1)).toContain('platform=x')
  expect(urls().at(-1)).toContain('show=pinned')
})

test('an empty platform offers the import', async () => {
  vi.mocked(api).mockResolvedValue({ items: [], next_cursor: null })
  renderPosts()
  await userEvent.click(screen.getByRole('tab', { name: 'LinkedIn' }))
  expect(await screen.findByRole('link', { name: 'Import your LinkedIn posts' })).toHaveAttribute(
    'href',
    '/import',
  )
})

test('more pages load on demand', async () => {
  vi.mocked(api)
    .mockResolvedValueOnce({ items: [post()], next_cursor: 'c2' })
    .mockResolvedValueOnce({
      items: [post({ id: 'p2', text: 'Second page post here.' })],
      next_cursor: null,
    })
  renderPosts()
  await userEvent.click(await screen.findByRole('button', { name: 'Load more' }))
  expect(await screen.findByText('Second page post here.')).toBeInTheDocument()
  expect(urls()[1]).toContain('cursor=c2')
})
