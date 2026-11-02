import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, vi } from 'vitest'
import type { DraftRow } from '../../api/types'
import { detail, row } from '../../test/drafts'
import { calls, routeApi, sent } from '../../test/fakeApi'
import { DraftsPage } from './DraftsPage'

vi.mock('../../api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/client')>()),
  api: vi.fn(),
}))

let drafts: DraftRow[]
beforeEach(() => {
  vi.clearAllMocks()
  drafts = [
    row({ id: 'd1', platform: 'x', text: 'A fresh X draft\nsecond line' }),
    row({
      id: 'd2',
      platform: 'x',
      status: 'approved',
      text: 'An approved X post',
      scheduled_for: new Date(Date.now() + 86_400_000).toISOString(),
      thread_id: 't1',
    }),
    row({ id: 'd3', platform: 'x', status: 'discarded', text: 'An old idea' }),
  ]
  routeApi({
    'GET /drafts': () => ({ items: drafts }),
    'GET /drafts/stats': () => ({ created: 3, published: 1, publish_rate: 1 / 3, edited: null }),
    'GET /me': () => ({ id: 'u1', email: 'a@b.c', timezone: 'Africa/Addis_Ababa' }),
    'GET /platforms/telegram': () => ({ channel: null }),
    'PATCH /drafts/:id': (b) => {
      const change = b as Partial<DraftRow>
      drafts = drafts.map((d) => (d.id === 'd1' ? { ...d, ...change } : d))
      return detail({ id: 'd1', ...change })
    },
    'DELETE /drafts/:id': () => null,
  })
})

function renderPage(entry = '/drafts/x') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[entry]}>
        <DraftsPage platform="x" />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const lastDraftsCall = () =>
  calls()
    .filter((c) => c.startsWith('GET /drafts?'))
    .at(-1)

test('one platform, by status: tabs ask the server and each card shows its status (§4.2)', async () => {
  renderPage()
  expect(screen.getByRole('heading', { name: 'X drafts' })).toBeInTheDocument()
  await vi.waitFor(() => expect(lastDraftsCall()).toBe('GET /drafts?platform=x&status=draft'))
  await userEvent.click(screen.getByRole('tab', { name: 'Approved' }))
  await vi.waitFor(() => expect(lastDraftsCall()).toBe('GET /drafts?platform=x&status=approved'))
  expect(screen.getByText('Last 7 days: 3 drafts, 1 posted (33%).')).toBeInTheDocument()
})

test('a draft has Approve, Discard and Edit, but no hand-off before approval (rule 4)', async () => {
  routeApi({
    'GET /drafts': () => ({ items: [drafts[0]] }),
    'GET /drafts/stats': () => ({ created: 0, published: 0, publish_rate: null, edited: null }),
    'GET /me': () => ({ id: 'u1', email: 'a@b.c' }),
    'GET /platforms/telegram': () => ({ channel: null }),
    'PATCH /drafts/:id': (b) => detail({ id: 'd1', ...(b as object) }),
  })
  renderPage()
  const card = await screen.findByRole('article', { name: /A fresh X draft/ })
  expect(within(card).getByText('AI draft')).toBeInTheDocument()
  expect(within(card).getByText('Draft')).toBeInTheDocument()
  expect(within(card).getByRole('button', { name: 'Approve and pick a day' })).toBeInTheDocument()
  expect(within(card).queryByRole('button', { name: 'Open in X' })).not.toBeInTheDocument()
  expect(within(card).getByRole('link', { name: 'Edit in chat' })).toBeInTheDocument()

  await userEvent.click(within(card).getByRole('button', { name: 'Discard' }))
  expect(sent('PATCH /drafts/d1')).toEqual([{ status: 'discarded' }])
  await userEvent.click(await screen.findByRole('button', { name: 'Undo' }))
  expect(sent('PATCH /drafts/d1').at(-1)).toEqual({ status: 'draft' })
})

test('approved posts get Copy now and Reschedule; edit opens the chat', async () => {
  routeApi({
    'GET /drafts': () => ({ items: [drafts[1]] }),
    'GET /drafts/stats': () => ({ created: 0, published: 0, publish_rate: null, edited: null }),
    'GET /me': () => ({ id: 'u1', email: 'a@b.c' }),
    'GET /platforms/telegram': () => ({ channel: null }),
  })
  renderPage('/drafts/x?status=approved')
  const card = await screen.findByRole('article', { name: /An approved X post/ })
  expect(within(card).getByRole('button', { name: 'Open in X' })).toBeInTheDocument()
  expect(within(card).getByRole('button', { name: 'Reschedule' })).toBeInTheDocument()
  expect(within(card).getByRole('link', { name: 'Edit in chat' })).toHaveAttribute(
    'href',
    '/chat/t1',
  )
})

test('discarded drafts can be restored or deleted forever after a confirmation', async () => {
  routeApi({
    'GET /drafts': () => ({ items: [drafts[2]] }),
    'GET /drafts/stats': () => ({ created: 0, published: 0, publish_rate: null, edited: null }),
    'GET /me': () => ({ id: 'u1', email: 'a@b.c' }),
    'GET /platforms/telegram': () => ({ channel: null }),
    'DELETE /drafts/:id': () => null,
  })
  renderPage('/drafts/x?status=discarded')
  const card = await screen.findByRole('article', { name: /An old idea/ })
  expect(within(card).getByRole('button', { name: 'Restore' })).toBeInTheDocument()
  await userEvent.click(within(card).getByRole('button', { name: 'Delete forever' }))
  const dialog = await screen.findByRole('dialog', { name: 'Delete this draft forever?' })
  await userEvent.click(within(dialog).getByRole('button', { name: 'Delete forever' }))
  await vi.waitFor(() => expect(calls()).toContain('DELETE /drafts/d3'))
})

test('an empty tab says what to do next', async () => {
  routeApi({
    'GET /drafts': () => ({ items: [] }),
    'GET /drafts/stats': () => ({ created: 0, published: 0, publish_rate: null, edited: null }),
    'GET /me': () => ({ id: 'u1', email: 'a@b.c' }),
  })
  renderPage()
  expect(await screen.findByText('Your drafts will appear here. Start a chat.')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Start a chat' })).toHaveAttribute('href', '/')
})

test('undoing the discard of an approved post schedules it again at the same time', async () => {
  const at = new Date(Date.now() + 2 * 86_400_000).toISOString()
  routeApi({
    'GET /drafts': () => ({ items: [{ ...drafts[1], scheduled_for: at }] }),
    'GET /drafts/stats': () => ({ created: 0, published: 0, publish_rate: null, edited: null }),
    'GET /me': () => ({ id: 'u1', email: 'a@b.c', timezone: 'UTC' }),
    'PATCH /drafts/:id': (b) => detail({ id: 'd2', ...(b as object) }),
    'POST /drafts/:id/schedule': () => ({
      draft: drafts[1],
      scheduled_for: at,
      rank: 1,
      reason: '',
      warning: null,
    }),
  })
  renderPage('/drafts/x?status=approved')
  const card = await screen.findByRole('article', { name: /An approved X post/ })
  await userEvent.click(within(card).getByRole('button', { name: 'Discard' }))
  const undo = await screen.findByRole('button', { name: 'Undo' })
  expect(undo).toHaveFocus()
  await userEvent.click(undo)
  await vi.waitFor(() =>
    expect(sent('POST /drafts/d2/schedule')).toEqual([{ day: at.slice(0, 10), at }]),
  )
})

test('over the limit, Approve is disabled and says why in words', async () => {
  const long = 'x'.repeat(300)
  routeApi({
    'GET /drafts': () => ({
      items: [
        row({
          id: 'd9',
          platform: 'x',
          text: long,
          length: { count: 300, limit: 280, over: true },
        }),
      ],
    }),
    'GET /drafts/stats': () => ({ created: 0, published: 0, publish_rate: null, edited: null }),
    'GET /me': () => ({ id: 'u1', email: 'a@b.c' }),
  })
  renderPage()
  const approve = await screen.findByRole('button', { name: 'Approve and pick a day' })
  expect(approve).toBeDisabled()
  expect(approve).toHaveAccessibleDescription(/cut 20 characters/)
})
