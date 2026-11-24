import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, vi } from 'vitest'
import type { DraftRow, Thread } from '../../api/types'
import { detail, row } from '../../test/drafts'
import { calls, routeApi, sent } from '../../test/fakeApi'
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
    'POST /drafts/:id/versions/:v/restore': () => detail({ id: 'd1' }),
    'GET /me/ai-keys': () => ({ enabled: false, providers: [], keys: [] }),
    'POST /drafts/:id/schedule': () => {
      // Relative to now: a fixed date turns into "passed" once the calendar reaches it.
      const tomorrow = new Date(Date.now() + 24 * 3600_000).toISOString()
      thread = makeThread([
        row({ id: 'd1', platform: 'x', status: 'approved', scheduled_for: tomorrow }),
      ])
      return {
        draft: thread.drafts[0],
        scheduled_for: tomorrow,
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

test('the panel shows the newest version; older ones fold into the history (§4.1)', async () => {
  renderThread()
  expect(await screen.findByRole('heading', { name: 'Finished the importer' })).toBeInTheDocument()
  const panel = screen.getByRole('region', { name: 'Drafts' })
  const open = within(panel).getByRole('article', { name: 'X draft, version 2' })
  expect(open).toHaveTextContent('Shorter one')
  expect(open).toHaveTextContent('AI draft')
  const history = screen.getByRole('region', { name: 'History' })
  expect(within(history).getByRole('button', { name: /X draft · v1/ })).toHaveTextContent(
    'First long version',
  )
  expect(within(history).getByText('Make it shorter please')).toBeInTheDocument()
})

test('a quick change under the draft revises it', async () => {
  renderThread()
  const open = await screen.findByRole('article', { name: 'X draft, version 2' })
  await userEvent.click(within(open).getByRole('button', { name: 'Punchier' }))
  await vi.waitFor(() =>
    expect(sent('POST /drafts/d1/revise')).toEqual([{ instruction: 'Punchier' }]),
  )
})

test('the message box changes the open draft; Enter sends', async () => {
  renderThread()
  const box = await screen.findByLabelText('Tell it what to change in the X draft')
  await userEvent.type(box, 'Mention the 31 skipped posts{Enter}')
  await vi.waitFor(() =>
    expect(sent('POST /drafts/d1/revise')).toEqual([
      { instruction: 'Mention the 31 skipped posts' },
    ]),
  )
})

test('Undo goes back to the version before', async () => {
  renderThread()
  const open = await screen.findByRole('article', { name: 'X draft, version 2' })
  await userEvent.click(within(open).getByRole('button', { name: 'Undo' }))
  await vi.waitFor(() => expect(calls()).toContain('POST /drafts/d1/versions/v1/restore'))
})

test('nothing is handed off before approval; approve asks only for the day (rule 4, FR-45)', async () => {
  renderThread()
  const open = await screen.findByRole('article', { name: 'X draft, version 2' })
  expect(within(open).queryByRole('button', { name: 'Open in X' })).not.toBeInTheDocument()
  expect(within(open).queryByRole('button', { name: 'Copy text' })).not.toBeInTheDocument()
  await userEvent.click(within(open).getByRole('button', { name: 'Approve and pick a day' }))
  await userEvent.click(within(open).getByRole('button', { name: 'Tomorrow' }))
  await vi.waitFor(() => expect(sent('POST /drafts/d1/schedule')).toHaveLength(1))
  expect(sent('POST /drafts/d1/schedule')[0]).toMatchObject({ at: null })
  expect(await within(open).findByText(/X's evening peak/)).toBeInTheDocument()
  expect(await within(open).findByRole('button', { name: 'Open in X' })).toBeInTheDocument()
})

test('arriving from the new-chat box writes straight away and reports a platform that failed', async () => {
  thread = makeThread([])
  renderThread({ write: ['x', 'linkedin'] })
  await vi.waitFor(() =>
    expect(sent('POST /threads/t1/generate')).toEqual([{ platforms: ['x', 'linkedin'] }]),
  )
  expect(await screen.findByRole('alert')).toHaveTextContent('LinkedIn: The AI is busy right now.')
})

test('a retry after a failure writes only the platform that failed', async () => {
  thread = makeThread([])
  renderThread({ write: ['x', 'linkedin'] })
  await userEvent.click(await screen.findByRole('button', { name: 'Try LinkedIn again' }))
  expect(sent('POST /threads/t1/generate').at(-1)).toEqual({ platforms: ['linkedin'] })
})

test('a chat with no drafts says what appears there and offers one action', async () => {
  thread = makeThread([])
  localStorage.setItem('voxlace-platforms', JSON.stringify(['telegram']))
  renderThread()
  expect(await screen.findByText('Your drafts appear here')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Write drafts' }))
  expect(sent('POST /threads/t1/generate')).toEqual([{ platforms: ['telegram'] }])
})

test('the check-in that opens a chat can be edited there (FR-6)', async () => {
  routeApi({
    'GET /threads/:id': () => thread,
    'GET /me': () => ({ id: 'u1', email: 'fete@example.com' }),
    'GET /platforms/telegram': () => ({ channel: null }),
    'PATCH /checkins/:id': (b) => {
      thread = { ...thread, checkin_text: (b as { text: string }).text }
      return { id: 'c1', ...(b as object) }
    },
  })
  renderThread()
  await userEvent.click(await screen.findByRole('button', { name: 'Edit check-in' }))
  const box = screen.getByLabelText('Check-in text')
  await userEvent.clear(box)
  await userEvent.type(box, 'Finished the importer and its tests')
  await userEvent.click(screen.getByRole('button', { name: 'Save check-in' }))
  expect(sent('PATCH /checkins/c1')).toEqual([{ text: 'Finished the importer and its tests' }])
  expect(await screen.findByText('Finished the importer and its tests')).toBeInTheDocument()
})

test('with the bot connected, an approved Telegram draft is posted on one click (FR-36)', async () => {
  const tomorrow = new Date(Date.now() + 24 * 3600_000).toISOString()
  thread = makeThread([
    row({ id: 'd1', platform: 'telegram', status: 'approved', scheduled_for: tomorrow }),
  ])
  routeApi({
    'GET /threads/:id': () => thread,
    'GET /me': () => ({ id: 'u1', email: 'fete@example.com' }),
    'GET /platforms/telegram': () => ({ channel: null }),
    'GET /telegram': () => ({
      enabled: true,
      bot_username: 'VoxlaceBot',
      linked: true,
      tg_username: 'fete',
      channel: { title: 'FeteScript', username: 'fetescript', can_post: true },
      connect_url: null,
    }),
    'POST /drafts/:id/publish': () => detail({ id: 'd1', status: 'published' }),
  })
  renderThread()
  const open = await screen.findByRole('article', { name: 'Telegram draft, version 2' })
  expect(await within(open).findByText(/The bot posts it to FeteScript/)).toBeInTheDocument()
  expect(within(open).getByText(/post it to FeteScript now, without waiting/)).toBeInTheDocument()
  await userEvent.click(within(open).getByRole('button', { name: 'Post to Telegram now' }))
  await vi.waitFor(() => expect(calls()).toContain('POST /drafts/d1/publish'))
})

test('a post the bot could not send says why, and can still be posted now (ADR 0001)', async () => {
  thread = makeThread([
    row({
      id: 'd1',
      platform: 'telegram',
      status: 'approved',
      bot_error: 'Make @VoxlaceBot an admin with “Post messages” again.',
    }),
  ])
  routeApi({
    'GET /threads/:id': () => thread,
    'GET /me': () => ({ id: 'u1', email: 'fete@example.com' }),
    'GET /platforms/telegram': () => ({ channel: null }),
    'GET /telegram': () => ({
      enabled: true,
      bot_username: 'VoxlaceBot',
      linked: true,
      tg_username: 'fete',
      channel: { title: 'FeteScript', username: 'fetescript', can_post: true },
      connect_url: null,
    }),
  })
  renderThread()
  const open = await screen.findByRole('article', { name: 'Telegram draft, version 2' })
  expect(
    await within(open).findByText(/The bot couldn't post it: Make @VoxlaceBot/),
  ).toBeInTheDocument()
  expect(within(open).getByRole('button', { name: 'Post to Telegram now' })).toBeInTheDocument()
})
