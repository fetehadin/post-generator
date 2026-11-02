import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, vi } from 'vitest'
import type { DraftRow, Thread } from '../../api/types'
import { detail, row } from '../../test/drafts'
import { routeApi, sent } from '../../test/fakeApi'
import { ThreadPage } from './ThreadPage'

vi.mock('../../api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/client')>()),
  api: vi.fn(),
}))

const card = (number: number, text: string, limit = 280) => ({
  version_id: `v${number}`,
  number,
  text,
  length: { count: text.length, limit, over: text.length > limit },
})

function makeThread(drafts: DraftRow[]): Thread {
  return {
    id: 't1',
    title: 'Finished the importer',
    checkin_id: 'c1',
    checkin_text: 'Finished the importer',
    created_at: '',
    updated_at: '',
    drafts,
    messages: [
      {
        id: 'm1',
        role: 'user',
        text: 'Finished the importer',
        draft_id: null,
        card: null,
        created_at: '',
      },
      ...(drafts.length
        ? [
            {
              id: 'm2',
              role: 'assistant' as const,
              text: '',
              draft_id: 'd1',
              card: card(1, 'First long version\nmore'),
              created_at: '',
            },
            {
              id: 'm3',
              role: 'user' as const,
              text: 'Make it shorter please',
              draft_id: 'd1',
              card: null,
              created_at: '',
            },
            {
              id: 'm4',
              role: 'assistant' as const,
              text: 'v2: Shorter',
              draft_id: 'd1',
              card: card(2, 'Shorter one'),
              created_at: '',
            },
          ]
        : []),
    ],
  }
}

let thread: Thread
beforeEach(() => {
  localStorage.clear()
  thread = makeThread([row({ id: 'd1', platform: 'x', text: 'Shorter one' })])
  routeApi({
    'GET /threads/:id': () => thread,
    'GET /me': () => ({ id: 'u1', email: 'fete@example.com', timezone: 'Africa/Addis_Ababa' }),
    'GET /platforms/telegram': () => ({ channel: null }),
    'POST /drafts/:id/revise': () => detail({ id: 'd1' }),
    'POST /drafts/:id/schedule': () => {
      thread = makeThread([
        row({ id: 'd1', platform: 'x', status: 'approved', scheduled_for: '2026-11-04T15:00:00Z' }),
      ])
      return {
        draft: thread.drafts[0],
        scheduled_for: '2026-11-04T15:00:00Z',
        rank: 1,
        reason: "your audience is in Addis Ababa · X's evening peak",
        warning: null,
      }
    },
    'POST /threads/:id/generate': (body) => ({
      ...makeThread([row({ id: 'd1', platform: 'x' })]),
      failures: (body as { platforms: string[] }).platforms.includes('linkedin')
        ? [{ platform: 'linkedin', code: 'ai_busy', message: 'The AI is busy right now.' }]
        : [],
    }),
  })
})

const renderThread = (state?: unknown) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[{ pathname: '/chat/t1', state }]}>
        <Routes>
          <Route path="/chat/:id" element={<ThreadPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )

test('a thread shows the check-in, folds older cards and opens the newest (§4.1)', async () => {
  renderThread()
  expect(await screen.findByRole('heading', { name: 'Finished the importer' })).toBeInTheDocument()
  const open = screen.getByRole('article', { name: 'X draft · v2' })
  expect(open).toHaveTextContent('Shorter one')
  expect(open).toHaveTextContent('AI draft')
  expect(screen.queryByRole('article', { name: 'X draft · v1' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: /X draft · v1/ })).toHaveTextContent(
    'First long version',
  )
  expect(screen.getByText('Make it shorter please')).toBeInTheDocument()
})

test('with one draft, replies go to it: a quick change revises it', async () => {
  renderThread()
  expect(await screen.findByText('Replying to: X draft')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Punchier' }))
  await vi.waitFor(() =>
    expect(sent('POST /drafts/d1/revise')).toEqual([{ instruction: 'Punchier' }]),
  )
})

test('nothing is handed off before approval; approve asks only for the day (rule 4, FR-45)', async () => {
  renderThread()
  const open = await screen.findByRole('article', { name: 'X draft · v2' })
  expect(within(open).queryByRole('button', { name: 'Open in X' })).not.toBeInTheDocument()
  await userEvent.click(within(open).getByRole('button', { name: 'Approve and pick a day' }))
  await userEvent.click(within(open).getByRole('button', { name: 'Tomorrow' }))
  await vi.waitFor(() => expect(sent('POST /drafts/d1/schedule')).toHaveLength(1))
  expect(sent('POST /drafts/d1/schedule')[0]).toMatchObject({ at: null })
  expect(await within(open).findByText(/X's evening peak/)).toBeInTheDocument()
  expect(await within(open).findByRole('button', { name: 'Open in X' })).toBeInTheDocument()
})

test('a new chat asks which platforms and reports a platform that failed', async () => {
  thread = makeThread([])
  localStorage.setItem('voxlace-platforms', JSON.stringify(['x', 'linkedin']))
  renderThread({ ask: true })
  const group = await screen.findByRole('group', { name: 'Which platforms?' })
  expect(within(group).getByRole('button', { name: 'X' })).toHaveAttribute('aria-pressed', 'true')
  expect(within(group).getByRole('button', { name: 'Telegram' })).toHaveAttribute(
    'aria-pressed',
    'false',
  )
  await userEvent.click(within(group).getByRole('button', { name: 'Write 2 drafts' }))
  expect(sent('POST /threads/t1/generate')).toEqual([{ platforms: ['x', 'linkedin'] }])
  expect(await screen.findByRole('alert')).toHaveTextContent('LinkedIn: The AI is busy right now.')
})

test('closing the reply box works with one draft, and Save does not ask for platforms', async () => {
  renderThread()
  await userEvent.click(await screen.findByRole('button', { name: 'Stop replying to this draft' }))
  expect(screen.queryByText('Replying to: X draft')).not.toBeInTheDocument()
  expect(screen.getByText('Press Reply on a card to change it.')).toBeInTheDocument()
  expect(screen.queryByRole('group', { name: 'Which platforms?' })).not.toBeInTheDocument()
})

test('a retry after a failure offers only the platform that failed', async () => {
  thread = makeThread([])
  localStorage.setItem('voxlace-platforms', JSON.stringify(['x', 'linkedin']))
  renderThread({ ask: true })
  await userEvent.click(await screen.findByRole('button', { name: 'Write 2 drafts' }))
  const retry = await screen.findByRole('button', { name: 'Try again' })
  const group = screen.getByRole('group', { name: 'Which platforms?' })
  expect(within(group).getByRole('button', { name: 'X' })).toHaveAttribute('aria-pressed', 'false')
  await userEvent.click(retry)
  expect(sent('POST /threads/t1/generate').at(-1)).toEqual({ platforms: ['linkedin'] })
})
