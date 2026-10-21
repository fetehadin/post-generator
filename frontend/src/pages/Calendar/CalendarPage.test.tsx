import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createEvent, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, vi } from 'vitest'
import type { DraftRow } from '../../api/types'
import { row } from '../../test/drafts'
import { calls, routeApi, sent } from '../../test/fakeApi'
import { CalendarPage } from './CalendarPage'

vi.mock('../../api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/client')>()),
  api: vi.fn(),
}))

// Wednesday 21 Oct 2026, 10:00 local. Only Date is faked, so timers and promises run as usual.
const NOW = new Date(2026, 9, 21, 10, 0)
const thu1830 = new Date(2026, 9, 22, 18, 30).toISOString()

let items: DraftRow[]
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: NOW })
  vi.clearAllMocks()
  items = [row({ id: 'd1', status: 'approved', scheduled_for: thu1830, text: 'Ship log' })]
  routeApi({
    'GET /drafts': () => ({ items }),
    'PATCH /drafts/:id': (b) => {
      const change = b as Partial<DraftRow>
      items = items.map((d) => ({ ...d, ...change })).filter((d) => d.status === 'approved') // Posted leaves the calendar's query
      return { ...items[0], ...change, versions: [], messages: [] }
    },
  })
})
afterEach(() => vi.useRealTimers())

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <CalendarPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

/** jsdom has no DataTransfer; a tiny stand-in carries the dragged id. */
function drag(from: HTMLElement, to: HTMLElement) {
  const data: Record<string, string> = {}
  const dataTransfer = {
    setData: (k: string, v: string) => (data[k] = v),
    getData: (k: string) => data[k],
    effectAllowed: '',
  }
  fireEvent(from, Object.assign(createEvent.dragStart(from), { dataTransfer }))
  fireEvent(to, Object.assign(createEvent.drop(to), { dataTransfer }))
}

test('asks for approved posts in this week, Monday to Monday, in UTC', async () => {
  renderPage()
  await screen.findAllByText('Ship log')
  const weekCall = calls().find((c) => c.includes('scheduled_to'))!
  const q = new URLSearchParams(weekCall.split('?')[1])
  expect(q.get('status')).toBe('approved')
  expect(q.get('scheduled_from')).toBe(new Date(2026, 9, 19).toISOString())
  expect(q.get('scheduled_to')).toBe(new Date(2026, 9, 26).toISOString())
})

test('shows the post at its day and hour, and in Up next', async () => {
  const { container } = renderPage()
  await screen.findAllByText('Ship log')
  const slot = container.querySelector('[data-slot="22-18"]') as HTMLElement
  expect(within(slot).getByText('Ship log')).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Up next' })).toBeInTheDocument()
})

test('dragging to another slot moves it there and keeps the minutes', async () => {
  const { container } = renderPage()
  await screen.findAllByText('Ship log')
  const item = container.querySelector('[data-slot="22-18"] [draggable]') as HTMLElement
  drag(item, container.querySelector('[data-slot="23-9"]') as HTMLElement)
  await vi.waitFor(() =>
    expect(sent('PATCH /drafts/d1')).toEqual([
      { scheduled_for: new Date(2026, 9, 23, 9, 30).toISOString() },
    ]),
  )
})

test('"Posted" marks it published and clears it from the calendar', async () => {
  const { container } = renderPage()
  await screen.findAllByText('Ship log')
  const slot = container.querySelector('[data-slot="22-18"]') as HTMLElement
  await userEvent.click(within(slot).getByRole('button', { name: 'Posted' }))
  await vi.waitFor(() =>
    expect(container.querySelector('[data-slot="22-18"] [draggable]')).toBeNull(),
  )
  expect(sent('PATCH /drafts/d1')).toEqual([{ status: 'published' }])
})

test('"Move to…" works without dragging', async () => {
  const { container } = renderPage()
  await screen.findAllByText('Ship log')
  const slot = container.querySelector('[data-slot="22-18"]') as HTMLElement
  await userEvent.click(within(slot).getByRole('button', { name: 'Move to…' }))
  fireEvent.change(within(slot).getByLabelText('New time (your time)'), {
    target: { value: '2026-10-24T08:15' },
  })
  await userEvent.click(within(slot).getByRole('button', { name: 'Move' }))
  await vi.waitFor(() =>
    expect(sent('PATCH /drafts/d1')).toEqual([
      { scheduled_for: new Date('2026-10-24T08:15').toISOString() },
    ]),
  )
})

test('the month view covers the whole month', async () => {
  renderPage()
  await userEvent.click(screen.getByRole('button', { name: 'Month' }))
  await vi.waitFor(() =>
    expect(calls().at(-1)).toContain(
      `scheduled_from=${encodeURIComponent(new Date(2026, 8, 28).toISOString())}`,
    ),
  )
  expect(screen.getByText(/October 2026/)).toBeInTheDocument()
})
