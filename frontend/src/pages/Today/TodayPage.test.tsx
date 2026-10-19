import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, vi } from 'vitest'
import { api, ApiError } from '../../api/client'
import type { Draft } from '../../api/types'
import { TodayPage } from './TodayPage'

vi.mock('../../api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/client')>()),
  api: vi.fn(),
}))

beforeEach(() => vi.clearAllMocks())

const draft: Draft = {
  id: 'd1',
  platform: 'telegram',
  status: 'draft',
  text: 'Small win today: the importer works.',
  length: { count: 36, limit: 4096, over: false },
  model: 'gemini-3.8-flash',
  examples_used: 8,
  created_at: '2026-10-19T09:00:00Z',
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <TodayPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

test('Generate stays disabled until there is something to write about', () => {
  renderPage()
  expect(screen.getByRole('button', { name: 'Generate draft' })).toBeDisabled()
})

test('sends the topic for Telegram and shows the draft with its counter and AI tag', async () => {
  vi.mocked(api).mockResolvedValue(draft)
  renderPage()
  await userEvent.type(screen.getByLabelText('What you worked on'), 'Finished the importer')
  await userEvent.click(screen.getByRole('button', { name: 'Generate draft' }))

  const [path, init] = vi.mocked(api).mock.calls[0]
  expect(path).toBe('/drafts/generate')
  expect(JSON.parse(String(init?.body))).toEqual({
    platform: 'telegram',
    topic: 'Finished the importer',
  })
  expect(await screen.findByLabelText('Draft text')).toHaveValue(draft.text)
  expect(screen.getByText('36 / 4,096')).toBeInTheDocument()
  expect(screen.getByText('AI draft')).toBeInTheDocument()
  expect(screen.queryByText(/gemini/)).not.toBeInTheDocument() // just the draft: no model names
})

test('keeps the topic and shows the message when the AI is busy', async () => {
  vi.mocked(api).mockRejectedValue(
    new ApiError(503, 'ai_unavailable', 'Drafts are unavailable right now. Your text is saved.'),
  )
  renderPage()
  await userEvent.type(screen.getByLabelText('What you worked on'), 'A lesson')
  await userEvent.click(screen.getByRole('button', { name: 'Generate draft' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Drafts are unavailable right now.')
  expect(screen.getByLabelText('What you worked on')).toHaveValue('A lesson')
})

test('points to the import page when there are no posts yet', async () => {
  vi.mocked(api).mockRejectedValue(
    new ApiError(400, 'no_posts', 'No Telegram posts are ready yet.'),
  )
  renderPage()
  await userEvent.type(screen.getByLabelText('What you worked on'), 'Hi')
  await userEvent.click(screen.getByRole('button', { name: 'Generate draft' }))
  expect(await screen.findByRole('link', { name: 'Import your posts' })).toHaveAttribute(
    'href',
    '/import',
  )
})

test('says so when the AI is slow, and keeps the topic', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.mocked(api).mockReturnValue(new Promise(() => {})) // never answers
  renderPage()
  await userEvent.type(screen.getByLabelText('What you worked on'), 'A lesson')
  await userEvent.click(screen.getByRole('button', { name: 'Generate draft' }))
  vi.advanceTimersByTime(21_000)
  expect(await screen.findByText(/taking longer than usual/)).toBeInTheDocument()
  expect(screen.getByLabelText('What you worked on')).toHaveValue('A lesson')
  vi.useRealTimers()
})
