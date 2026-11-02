import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, vi } from 'vitest'
import type { DraftRow } from '../api/types'
import { row } from '../test/drafts'
import { routeApi } from '../test/fakeApi'
import { AppShell } from './AppShell'

vi.mock('../api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/client')>()),
  api: vi.fn(),
}))

beforeEach(() => {
  localStorage.clear()
  delete document.documentElement.dataset.theme
  due = []
  missed = []
  routeApi({
    'GET /me': () => ({
      id: 'u1',
      email: 'fetehadin@example.com',
      admitted: true,
      privacy_accepted: true,
    }),
    'GET /me/notifications': () => ({ due, missed, checkin_reminder: false }),
    'GET /threads': () => ({
      items: [{ id: 't1', title: 'Finished the importer', platforms: ['x'], updated_at: '' }],
    }),
    'GET /platforms/telegram': () => ({ channel: null }),
  })
})

let due: DraftRow[] = []
let missed: DraftRow[] = []

const renderShell = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <AppShell />
      </MemoryRouter>
    </QueryClientProvider>,
  )

const sidebar = () => screen.getAllByRole('navigation', { name: 'Main' })[0].closest('aside')!

test('the sidebar has New chat, past chats, Drafts by platform, Calendar and Profile (§2)', async () => {
  renderShell()
  const side = within(sidebar())
  expect(side.getByRole('link', { name: 'New chat' })).toHaveAttribute('href', '/')
  expect(await side.findByRole('link', { name: 'Finished the importer' })).toHaveAttribute(
    'href',
    '/chat/t1',
  )
  for (const [name, href] of [
    ['X', '/drafts/x'],
    ['LinkedIn', '/drafts/linkedin'],
    ['Telegram', '/drafts/telegram'],
    ['Calendar', '/calendar'],
  ])
    expect(side.getByRole('link', { name })).toHaveAttribute('href', href)
  expect(await side.findByText('fetehadin')).toBeInTheDocument()
  expect(side.getByRole('link', { name: /Profile & settings/ })).toHaveAttribute('href', '/profile')
})

test('Drafts folds its platforms away and remembers it', async () => {
  const { unmount } = renderShell()
  const toggle = within(sidebar()).getByRole('button', { name: 'Drafts' })
  expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await userEvent.click(toggle)
  expect(within(sidebar()).queryByRole('link', { name: 'LinkedIn' })).not.toBeInTheDocument()
  unmount()
  renderShell()
  expect(within(sidebar()).getByRole('button', { name: 'Drafts' })).toHaveAttribute(
    'aria-expanded',
    'false',
  )
})

test('the theme icon in the header switches light ⇄ dark (no mixed theme in v3)', async () => {
  renderShell()
  const seen = []
  for (let i = 0; i < 3; i++) {
    await userEvent.click(within(sidebar()).getByRole('button', { name: /^Theme:/ }))
    seen.push(document.documentElement.dataset.theme)
  }
  expect(seen).toEqual(['dark', 'light', 'dark'])
})

test('the collapse button sits at the bottom of the sidebar, keeps labels and is remembered', async () => {
  const { unmount } = renderShell()
  const button = within(sidebar()).getByRole('button', { name: 'Collapse sidebar' })
  await userEvent.click(button)
  expect(within(sidebar()).getByRole('link', { name: 'New chat' })).toBeInTheDocument()
  unmount()
  renderShell()
  expect(within(sidebar()).getByRole('button', { name: 'Expand sidebar' })).toHaveAttribute(
    'aria-expanded',
    'false',
  )
})

test('when a post is due, the bell opens the notifications with copy-and-open', async () => {
  due = [row({ status: 'approved', platform: 'linkedin', scheduled_for: '2026-10-22T08:00:00Z' })]
  missed = [row({ id: 'm1', status: 'approved', scheduled_for: '2026-10-20T08:00:00Z' })]
  renderShell()
  const bell = await within(sidebar()).findByRole('button', { name: '2 things need you' })
  await userEvent.click(bell)
  const panel = await screen.findByRole('dialog', { name: 'Notifications' })
  expect(within(panel).getByText('LinkedIn post due now')).toBeInTheDocument()
  expect(within(panel).getByRole('button', { name: 'Copy and open LinkedIn' })).toBeInTheDocument()
  expect(within(panel).getByRole('heading', { name: 'Missed' })).toBeInTheDocument()
  expect(within(panel).getByRole('button', { name: 'Reschedule' })).toBeInTheDocument()
})

test('no bell when nothing is due', async () => {
  renderShell()
  await within(sidebar()).findByText('fetehadin')
  expect(within(sidebar()).queryByRole('button', { name: /need you/ })).not.toBeInTheDocument()
})
