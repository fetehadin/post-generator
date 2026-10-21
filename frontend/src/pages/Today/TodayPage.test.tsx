import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, vi } from 'vitest'
import { api, ApiError } from '../../api/client'
import type { Draft, Platform } from '../../api/types'
import { TodayPage } from './TodayPage'

vi.mock('../../api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/client')>()),
  api: vi.fn(),
}))

beforeEach(() => vi.clearAllMocks())

const draft = (platform: Platform, text = 'Small win today: the importer works.'): Draft => ({
  id: `d-${platform}`,
  platform,
  status: 'draft',
  text,
  length: { count: text.length, limit: platform === 'x' ? 280 : 4096, over: false },
  model: 'gemini-3.8-flash',
  examples_used: 8,
  created_at: '2026-10-21T09:00:00Z',
})

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

const write = (text: string) => userEvent.type(screen.getByLabelText('What you worked on'), text)
const bodies = () => vi.mocked(api).mock.calls.map((c) => JSON.parse(String(c[1]?.body)))

test('asks "What did you do today?" and needs something to write about', () => {
  renderPage()
  expect(screen.getByRole('heading', { name: 'What did you do today?' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Generate 1 draft' })).toBeDisabled()
})

test('one draft for Telegram, with its counter and AI tag and no model name', async () => {
  vi.mocked(api).mockResolvedValue(draft('telegram'))
  renderPage()
  await write('Finished the importer')
  await userEvent.click(screen.getByRole('button', { name: 'Generate 1 draft' }))
  expect(bodies()).toEqual([{ platform: 'telegram', topic: 'Finished the importer' }])
  expect(await screen.findByLabelText('Telegram draft text')).toHaveValue(draft('telegram').text)
  expect(screen.getByText('36 / 4,096')).toBeInTheDocument()
  expect(screen.getByText('AI draft')).toBeInTheDocument()
  expect(screen.queryByText(/gemini/)).not.toBeInTheDocument()
})

test('logo buttons pick platforms; one failing platform never hides the others', async () => {
  vi.mocked(api).mockImplementation(async (_path, init) => {
    const { platform } = JSON.parse(String(init?.body))
    if (platform === 'linkedin')
      throw new ApiError(400, 'no_posts', 'No LinkedIn posts are ready yet.')
    return draft(platform)
  })
  renderPage()
  await userEvent.click(screen.getByRole('button', { name: 'X' }))
  await userEvent.click(screen.getByRole('button', { name: 'LinkedIn' }))
  expect(screen.getByRole('button', { name: 'X' })).toHaveAttribute('aria-pressed', 'true')
  await write('Shipped X import')
  await userEvent.click(screen.getByRole('button', { name: 'Generate 3 drafts' }))

  expect(
    bodies()
      .map((b) => b.platform)
      .sort(),
  ).toEqual(['linkedin', 'telegram', 'x'])
  expect(await screen.findByLabelText('X draft text')).toBeInTheDocument()
  expect(screen.getByLabelText('Telegram draft text')).toBeInTheDocument()
  expect(screen.getByRole('alert')).toHaveTextContent('LinkedIn: No LinkedIn posts are ready yet.')
  expect(screen.getByRole('link', { name: 'Import your LinkedIn posts' })).toHaveAttribute(
    'href',
    '/import',
  )
})

test('with no platform chosen there is nothing to generate', async () => {
  renderPage()
  await userEvent.click(screen.getByRole('button', { name: 'Telegram' }))
  await write('Hi')
  expect(screen.getByRole('button', { name: 'Generate 0 drafts' })).toBeDisabled()
  expect(screen.getByText('Pick at least one platform.')).toBeInTheDocument()
})

test('keeps the topic and says so when the AI is slow', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.mocked(api).mockReturnValue(new Promise(() => {}))
  renderPage()
  await write('A lesson')
  await userEvent.click(screen.getByRole('button', { name: 'Generate 1 draft' }))
  vi.advanceTimersByTime(21_000)
  expect(await screen.findByText(/taking longer than usual/)).toBeInTheDocument()
  expect(screen.getByLabelText('What you worked on')).toHaveValue('A lesson')
  vi.useRealTimers()
})

test('developers can open the exact prompt behind a draft', async () => {
  vi.mocked(api).mockResolvedValueOnce(draft('telegram')).mockResolvedValueOnce({
    prompt: 'You write one Telegram post…',
    model: 'm',
    model_version: 'v',
    provider: 'google',
  })
  renderPage()
  await write('A lesson')
  await userEvent.click(screen.getByRole('button', { name: 'Generate 1 draft' }))
  await userEvent.click(await screen.findByText('Prompt (developer view)'))
  expect(await screen.findByText('You write one Telegram post…')).toBeInTheDocument()
  expect(vi.mocked(api).mock.calls[1][0]).toBe('/drafts/d-telegram/prompt')
})
