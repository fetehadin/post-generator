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
let missed: DraftRow[]
let bot: boolean
const matchMediaStub = window.matchMedia.bind(window)

/** A computer (768px and wider) or a phone. */
function screenIs(kind: 'computer' | 'phone') {
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
    ...matchMediaStub(query),
    matches: kind === 'computer' && query === '(min-width: 1024px)',
  }))
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: NOW })
  vi.clearAllMocks()
  screenIs('computer')
  due = []
  missed = []
  bot = false
  items = [row({ id: 'd1', status: 'approved', scheduled_for: thu1830, text: 'Ship log' })]
  routeApi({
    // Answers like the API: only the asked status.
    'GET /drafts': (_b, _i, path) => {
      const status = new URLSearchParams(path!.split('?')[1]).get('status')
      return { items: items.filter((d) => d.status === status) }
    },
    'GET /me': () => ({ id: 'u', email: 'a@b', admitted: true, privacy_accepted: true }),
    'GET /me/notifications': () => ({ due, missed, checkin_reminder: false }),
    'GET /platforms/:p': () => ({ channel: null }),
    'GET /telegram': () => ({
      linked: bot,
      channel: bot ? { title: 'My channel', username: 'mine', can_post: true } : null,
      connect_url: null,
    }),
    'PATCH /drafts/:id': (b) => {
      const change = b as Partial<DraftRow>
      items = items.map((d) => ({ ...d, ...change })).filter((d) => d.status !== 'draft')
      return { ...items[0], ...change, versions: [], messages: [] }
    },
  })
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

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

/** A cell of the week grid: a day and a two-hour row (18 = 18:00–20:00). */
const slot = (container: HTMLElement, day: string, row: number) =>
  container.querySelector(`[data-drop-day="${day}"][data-drop-hour="${row}"]`) as HTMLElement

/** The time as the app writes it: 24-hour, e.g. "18:30". */
const hm = (iso: string) =>
  new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso))

/** The post's card in the week grid. */
async function card(container: HTMLElement, day = '2026-10-22', row = 18, iso = thu1830) {
  const name = new RegExp(`Telegram at ${hm(iso)}`)
  return within(
    await vi.waitFor(() => {
      const el = slot(container, day, row)
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

test('asks for approved and posted posts in this week, Monday to Monday, in UTC', async () => {
  const { container } = renderPage()
  await card(container)
  const week = calls()
    .filter((c) => c.includes('scheduled_to'))
    .map((c) => new URLSearchParams(c.split('?')[1]))
  expect(week.map((q) => q.get('status')).sort()).toEqual(['approved', 'published'])
  for (const q of week) {
    expect(q.get('scheduled_from')).toBe(new Date(2026, 9, 19).toISOString())
    expect(q.get('scheduled_to')).toBe(new Date(2026, 9, 26).toISOString())
  }
})

test('a post sits on its day in its two-hour row, with its text', async () => {
  const { container } = renderPage()
  await card(container)
  expect(within(slot(container, '2026-10-22', 18)).getByText('Ship log')).toBeInTheDocument()
  expect(container.querySelectorAll('[data-drop-hour]')).toHaveLength(7 * 12)
})

test('no best-hours row and no month or day view', async () => {
  const { container } = renderPage()
  await card(container)
  expect(screen.queryByText(/Best hours/)).toBeNull()
  expect(screen.queryByRole('button', { name: 'month' })).toBeNull()
  expect(screen.getByRole('button', { name: 'today' })).toBeInTheDocument()
})

test('dropped on the same row of another day, it keeps its exact time', async () => {
  const { container } = renderPage()
  const item = await card(container)
  pointerDrag(item.parentElement!, slot(container, '2026-10-23', 18))
  await vi.waitFor(() =>
    expect(sent('PATCH /drafts/d1')).toEqual([
      { scheduled_for: new Date(2026, 9, 23, 18, 30).toISOString() },
    ]),
  )
})

test("dropped on another row, it starts at that row's hour", async () => {
  const { container } = renderPage()
  const item = await card(container)
  pointerDrag(item.parentElement!, slot(container, '2026-10-23', 8))
  await vi.waitFor(() =>
    expect(sent('PATCH /drafts/d1')).toEqual([
      { scheduled_for: new Date(2026, 9, 23, 8, 0).toISOString() },
    ]),
  )
})

test('a touch press on the post itself scrolls; only the grip drags', async () => {
  const { container } = renderPage()
  const item = await card(container)
  document.elementFromPoint = () => slot(container, '2026-10-23', 8)
  fireEvent.pointerDown(item, { button: 0, pointerType: 'touch', clientX: 0, clientY: 0 })
  fireEvent.pointerMove(window, { clientX: 40, clientY: 80 })
  fireEvent.pointerUp(window, { clientX: 40, clientY: 80 })
  const grip = item.parentElement!.querySelector('[data-grip]') as HTMLElement
  fireEvent.pointerDown(grip, { button: 0, pointerType: 'touch', clientX: 0, clientY: 0 })
  fireEvent.pointerMove(window, { clientX: 40, clientY: 80 })
  fireEvent.pointerUp(window, { clientX: 40, clientY: 80 })
  await vi.waitFor(() => expect(sent('PATCH /drafts/d1')).toHaveLength(1))
})

test('a drop on a slot that has passed is refused and says why', async () => {
  const { container } = renderPage()
  const item = await card(container)
  pointerDrag(item.parentElement!, slot(container, '2026-10-20', 8))
  expect(await screen.findByText(/That time has passed/)).toBeInTheDocument()
  expect(sent('PATCH /drafts/d1')).toEqual([])
})

test('a posted post stays in its week, marked Posted, and does not move', async () => {
  const mon = new Date(2026, 9, 19, 9, 0).toISOString()
  items.push(row({ id: 'p1', status: 'published', scheduled_for: mon, text: 'Went out' }))
  const { container } = renderPage()
  const done = await card(container, '2026-10-19', 8, mon)
  expect(done).toHaveAccessibleName(/posted/)
  expect(within(done).getByText('Posted')).toBeInTheDocument()
  expect(done.parentElement!.querySelector('[data-grip]')).toBeNull()
})

test('the post opens a panel: "Posted" marks it published', async () => {
  const { container } = renderPage()
  await userEvent.click(await card(container))
  await userEvent.click(await screen.findByRole('button', { name: 'Posted' }))
  await vi.waitFor(() => expect(sent('PATCH /drafts/d1')).toEqual([{ status: 'published' }]))
})

test('"Back to drafts" takes it off the calendar', async () => {
  const { container } = renderPage()
  await userEvent.click(await card(container))
  await userEvent.click(await screen.findByRole('button', { name: 'Back to drafts' }))
  await vi.waitFor(() => expect(sent('PATCH /drafts/d1')).toEqual([{ status: 'draft' }]))
})

test('"Change time" works without dragging', async () => {
  const { container } = renderPage()
  await userEvent.click(await card(container))
  await userEvent.click(await screen.findByRole('button', { name: 'Change time' }))
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
  await userEvent.click(await card(container))
  expect(await screen.findByRole('link', { name: 'Edit' })).toHaveAttribute('href', '/drafts/d1')
})

test('a missed post is marked, and its hand-off copies it then asks if it was posted', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined)
  Object.assign(navigator, { clipboard: { writeText } })
  items = [row({ id: 'd1', status: 'approved', scheduled_for: tue0900, text: 'Old news' })]
  const { container } = renderPage()
  const late = await card(container, '2026-10-20', 8, tue0900)
  expect(late).toHaveAccessibleName(/missed/)
  await userEvent.click(late)
  await userEvent.click(await screen.findByRole('button', { name: 'Send now' }))
  expect(writeText).toHaveBeenCalledWith('Old news')
  await userEvent.click(await screen.findByRole('button', { name: 'Yes, mark as posted' }))
  await vi.waitFor(() => expect(sent('PATCH /drafts/d1')).toEqual([{ status: 'published' }]))
})

test('a Telegram post the bot sends says so', async () => {
  bot = true
  const { container } = renderPage()
  const item = await card(container)
  await vi.waitFor(() => expect(item).toHaveAccessibleName(/bot sends/))
})

test('weeks go forward only: no going back before this week', async () => {
  renderPage()
  expect(await screen.findByText(/This week/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Previous week' })).toBeDisabled()
  await userEvent.click(screen.getByRole('button', { name: 'Next week' }))
  expect(await screen.findByText(/Next week/)).toBeInTheDocument()
  await vi.waitFor(() =>
    expect(calls().at(-1)).toContain(
      `scheduled_from=${encodeURIComponent(new Date(2026, 9, 26).toISOString())}`,
    ),
  )
})

test('an earlier week, or a date that is not a real day, opens this week', async () => {
  renderPage('/calendar?view=week&date=2026-09-01')
  expect(await screen.findByText(/This week/)).toBeInTheDocument()
  renderPage('/calendar?view=week&date=2026-13-40')
  expect((await screen.findAllByText(/This week/)).length).toBe(2)
})

test('Today shows each of today’s posts in full, with its actions in view', async () => {
  const wed1500 = new Date(2026, 9, 21, 15, 0).toISOString()
  items = [
    row({ id: 'd1', status: 'approved', scheduled_for: wed1500, text: 'Line one\nLine two' }),
  ]
  renderPage('/calendar?view=today')
  expect(await screen.findByText(/Today ·/)).toBeInTheDocument()
  expect(await screen.findByText(/Line one\s+Line two/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Change time' })).toBeInTheDocument()
  const q = new URLSearchParams(
    calls()
      .find((c) => c.includes('scheduled_to'))!
      .split('?')[1],
  )
  expect(q.get('scheduled_from')).toBe(new Date(2026, 9, 21).toISOString())
  expect(q.get('scheduled_to')).toBe(new Date(2026, 9, 22).toISOString())
})

test('a phone opens on Today, and its week is a list by day with no dragging', async () => {
  screenIs('phone')
  const { container } = renderPage()
  expect(await screen.findByText(/Today ·/)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'week' }))
  expect(await screen.findByRole('button', { name: /Telegram at 18:30/ })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: /22/ })).toBeInTheDocument()
  expect(container.querySelector('[data-drop-day]')).toBeNull()
  expect(container.querySelector('[data-grip]')).toBeNull()
})

test('an empty week says so and offers to write a post', async () => {
  items = []
  renderPage()
  expect(await screen.findByText('Nothing planned this week.')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Write a post' })).toHaveAttribute('href', '/')
})

test('"Needs you" holds missed and due posts, with Post now and Change time', async () => {
  missed = [row({ id: 'm1', status: 'approved', scheduled_for: tue0900, text: 'Late one' })]
  due = [row({ id: 'u1', status: 'approved', scheduled_for: NOW.toISOString(), text: 'Due one' })]
  renderPage('/calendar?view=week&date=2026-11-30')
  const section = await screen.findByRole('region', { name: 'Needs you' })
  expect(within(section).getByText('Late one')).toBeInTheDocument()
  expect(within(section).getByText('Due one')).toBeInTheDocument()
  expect(within(section).getByText('Missed')).toBeInTheDocument()
  expect(within(section).getByText('Due now')).toBeInTheDocument()
  expect(within(section).getAllByRole('button', { name: 'Change time' })).toHaveLength(2)
  expect(screen.queryByRole('heading', { name: 'Up next' })).toBeNull()
})

test('nothing due or missed: no "Needs you"', async () => {
  const { container } = renderPage()
  await card(container)
  expect(screen.queryByRole('region', { name: 'Needs you' })).toBeNull()
})
