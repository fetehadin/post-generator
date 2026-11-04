import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, within } from '@testing-library/react'
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
const tue0900 = new Date(2026, 9, 20, 9, 0).toISOString() // passed yesterday: missed

let items: DraftRow[]
let due: DraftRow[]
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: NOW })
  vi.clearAllMocks()
  localStorage.clear()
  due = []
  items = [row({ id: 'd1', status: 'approved', scheduled_for: thu1830, text: 'Ship log' })]
  routeApi({
    'GET /drafts': () => ({ items }),
    'GET /me': () => ({ id: 'u', email: 'a@b', admitted: true, privacy_accepted: true }),
    'GET /me/notifications': () => ({ due, missed: [], checkin_reminder: false }),
    'GET /platforms/:p': () => ({ channel: null }),
    'GET /platforms/:p/best-hours': () => ({
      platform: 'x',
      timezone: 'UTC',
      source: 'studies',
      days: [{ date: '2026-10-22', scores: Array(24).fill(0.5), best: [9, 12] }],
    }),
    'PATCH /drafts/:id': (b) => {
      const change = b as Partial<DraftRow>
      items = items.map((d) => ({ ...d, ...change })).filter((d) => d.status === 'approved') // Posted leaves the calendar's query
      return { ...items[0], ...change, versions: [], messages: [] }
    },
  })
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const matchMediaStub = window.matchMedia.bind(window)

function renderPage(path = '/calendar') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <CalendarPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const slot = (container: HTMLElement, day: string, hour: number) =>
  container.querySelector(`[data-drop-day="${day}"][data-drop-hour="${hour}"]`) as HTMLElement

/** The time as the app writes it in this locale (e.g. "18:30" or "06:30 PM"). */
const hm = (iso: string) =>
  new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(iso))

/** The post's chip in the week grid (the phone list holds a second copy in jsdom). */
async function chip(container: HTMLElement, day = '2026-10-22', hour = 18, iso = thu1830) {
  const name = new RegExp(`Telegram at ${hm(iso)}`)
  return within(
    await vi.waitFor(() => {
      const el = slot(container, day, hour)
      if (!el) throw new Error('no slot yet')
      return el
    }),
  ).findByRole('button', { name })
}

/** jsdom can't lay out a page, so the element under the pointer is faked. */
function pointerDrag(from: HTMLElement, to: HTMLElement) {
  document.elementFromPoint = () => to
  fireEvent.pointerDown(from, { button: 0, pointerType: 'mouse', clientX: 0, clientY: 0 })
  fireEvent.pointerMove(window, { clientX: 40, clientY: 80 })
  fireEvent.pointerUp(window, { clientX: 40, clientY: 80 })
}

test('asks for approved posts in this week, Monday to Monday, in UTC', async () => {
  const { container } = renderPage()
  await chip(container)
  const weekCall = calls().find((c) => c.includes('scheduled_to'))!
  const q = new URLSearchParams(weekCall.split('?')[1])
  expect(q.get('status')).toBe('approved')
  expect(q.get('scheduled_from')).toBe(new Date(2026, 9, 19).toISOString())
  expect(q.get('scheduled_to')).toBe(new Date(2026, 9, 26).toISOString())
})

test('shows the post at its day and hour, and in Up next', async () => {
  const { container } = renderPage()
  await chip(container)
  expect(within(slot(container, '2026-10-22', 18)).getByText('Ship log')).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Up next' })).toBeInTheDocument()
})

test('dragging with the pointer moves it to the slot and keeps the minutes', async () => {
  const { container } = renderPage()
  const item = await chip(container)
  pointerDrag(item.parentElement!, slot(container, '2026-10-23', 9))
  await vi.waitFor(() =>
    expect(sent('PATCH /drafts/d1')).toEqual([
      { scheduled_for: new Date(2026, 9, 23, 9, 30).toISOString() },
    ]),
  )
})

test('a touch press on the post itself scrolls; only the grip drags', async () => {
  const { container } = renderPage()
  const item = await chip(container)
  document.elementFromPoint = () => slot(container, '2026-10-23', 9)
  fireEvent.pointerDown(item, { button: 0, pointerType: 'touch', clientX: 0, clientY: 0 })
  fireEvent.pointerMove(window, { clientX: 40, clientY: 80 })
  fireEvent.pointerUp(window, { clientX: 40, clientY: 80 })
  const grip = item.parentElement!.querySelector('[data-grip]') as HTMLElement
  fireEvent.pointerDown(grip, { button: 0, pointerType: 'touch', clientX: 0, clientY: 0 })
  fireEvent.pointerMove(window, { clientX: 40, clientY: 80 })
  fireEvent.pointerUp(window, { clientX: 40, clientY: 80 })
  await vi.waitFor(() => expect(sent('PATCH /drafts/d1')).toHaveLength(1))
})

test('the post opens a menu: "Posted" marks it published and clears it', async () => {
  const { container } = renderPage()
  await userEvent.click(await chip(container))
  await userEvent.click(await screen.findByRole('button', { name: 'Posted' }))
  await vi.waitFor(() =>
    expect(within(slot(container, '2026-10-22', 18)).queryByRole('button')).toBeNull(),
  )
  expect(sent('PATCH /drafts/d1')).toEqual([{ status: 'published' }])
})

test('"Move to…" works without dragging', async () => {
  const { container } = renderPage()
  await userEvent.click(await chip(container))
  await userEvent.click(await screen.findByRole('button', { name: 'Move to…' }))
  fireEvent.change(screen.getByLabelText('New time (your time)'), {
    target: { value: '2026-10-24T08:15' },
  })
  await userEvent.click(screen.getByRole('button', { name: 'Move' }))
  await vi.waitFor(() =>
    expect(sent('PATCH /drafts/d1')).toEqual([
      { scheduled_for: new Date('2026-10-24T08:15').toISOString() },
    ]),
  )
})

test('Edit opens the draft (its chat)', async () => {
  const { container } = renderPage()
  await userEvent.click(await chip(container))
  expect(await screen.findByRole('link', { name: 'Edit' })).toHaveAttribute('href', '/drafts/d1')
})

test('a missed post is marked, and its hand-off copies it then asks if it was posted', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined)
  Object.assign(navigator, { clipboard: { writeText } })
  items = [row({ id: 'd1', status: 'approved', scheduled_for: tue0900, text: 'Old news' })]
  const { container } = renderPage()
  const missed = await chip(container, '2026-10-20', 9, tue0900)
  expect(missed).toHaveAccessibleName(/missed/)
  await userEvent.click(missed)
  await userEvent.click(await screen.findByRole('button', { name: /^(Copy|Open in)/ }))
  expect(writeText).toHaveBeenCalledWith('Old news')
  await userEvent.click(await screen.findByRole('button', { name: 'Yes, mark as posted' }))
  await vi.waitFor(() => expect(sent('PATCH /drafts/d1')).toEqual([{ status: 'published' }]))
})

test('the best hours of the chosen platform are shaded, and can be turned off', async () => {
  // A desktop width: phones show the week as a list without shading, and don't fetch it.
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
    ...matchMediaStub(query),
    matches: query === '(min-width: 768px)',
  }))
  const { container } = renderPage()
  await chip(container)
  await vi.waitFor(() =>
    expect(within(slot(container, '2026-10-22', 9)).getByText('Best hour for X.')).toBeTruthy(),
  )
  expect(calls().some((c) => c.includes('/platforms/x/best-hours?start=2026-10-19&days=7'))).toBe(
    true,
  )
  await userEvent.click(screen.getByRole('button', { name: 'Off' }))
  expect(within(slot(container, '2026-10-22', 9)).queryByText('Best hour for X.')).toBeNull()
})

test('the month view covers the whole month, and a day opens the day view', async () => {
  renderPage()
  await userEvent.click(screen.getByRole('button', { name: 'month' }))
  await vi.waitFor(() =>
    expect(calls().at(-1)).toContain(
      `scheduled_from=${encodeURIComponent(new Date(2026, 8, 28).toISOString())}`,
    ),
  )
  expect(screen.getByText(/October 2026/)).toBeInTheDocument()
  await userEvent.click(
    screen.getByRole('button', { name: `Open ${new Date(2026, 9, 22).toDateString()}` }),
  )
  expect(await screen.findByText(/Thursday/)).toBeInTheDocument()
  const dayCall = calls()
    .filter((c) => c.includes('scheduled_to'))
    .at(-1)!
  const q = new URLSearchParams(dayCall.split('?')[1])
  expect(q.get('scheduled_from')).toBe(new Date(2026, 9, 22).toISOString())
  expect(q.get('scheduled_to')).toBe(new Date(2026, 9, 23).toISOString())
})

test('busy month days show "+N more"', async () => {
  items = Array.from({ length: 5 }, (_, i) =>
    row({
      id: `d${i}`,
      status: 'approved',
      scheduled_for: new Date(2026, 9, 22, 8 + i).toISOString(),
    }),
  )
  renderPage('/calendar?view=month&date=2026-10-21')
  expect(await screen.findByRole('button', { name: '+2 more' })).toBeInTheDocument()
})

test('a drop on a slot that has passed is refused and says why', async () => {
  const { container } = renderPage()
  const item = await chip(container)
  pointerDrag(item.parentElement!, slot(container, '2026-10-20', 9))
  expect(await screen.findByText(/That time has passed/)).toBeInTheDocument()
  expect(sent('PATCH /drafts/d1')).toEqual([])
})

test('on phones a month day names its posts and their state, not colour alone', async () => {
  items = [
    row({ id: 'd1', status: 'approved', scheduled_for: tue0900 }),
    row({ id: 'd2', status: 'approved', scheduled_for: new Date(2026, 9, 20, 18).toISOString() }),
  ]
  renderPage('/calendar?view=month&date=2026-10-21')
  expect(await screen.findByRole('button', { name: /: 2 posts, 2 missed$/ })).toBeInTheDocument()
})

test('a date in the address that is not a real day opens today instead of crashing', async () => {
  renderPage('/calendar?view=week&date=2026-13-40')
  expect(await screen.findByText(/19 Oct|Oct 19/)).toBeTruthy()
})

test('posts due now stay at the top, whatever range is on screen', async () => {
  due = [
    row({ id: 'due1', status: 'approved', scheduled_for: NOW.toISOString(), text: 'Due post' }),
  ]
  renderPage('/calendar?view=month&date=2026-12-01')
  const section = await screen.findByRole('region', { name: 'Due now' })
  expect(within(section).getByText(/Due post/)).toBeTruthy()
})
