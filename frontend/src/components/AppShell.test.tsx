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
  routeApi({
    'GET /me': () => ({
      id: 'u1',
      email: 'fetehadin@example.com',
      admitted: true,
      privacy_accepted: true,
    }),
    'GET /drafts': () => ({ items: due }),
  })
})

let due: DraftRow[] = []

const renderShell = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <AppShell />
      </MemoryRouter>
    </QueryClientProvider>,
  )

const sidebar = () => screen.getAllByRole('navigation', { name: 'Main' })[0].closest('aside')!

test('the sidebar has Home, Calendar, Drafts and the profile card (DESIGN.md §2)', async () => {
  renderShell()
  const side = within(sidebar())
  for (const name of ['Home', 'Calendar', 'Drafts']) {
    expect(side.getByRole('link', { name })).toBeInTheDocument()
  }
  expect(await side.findByText('fetehadin')).toBeInTheDocument()
  expect(side.getByRole('link', { name: /Profile & settings/ })).toHaveAttribute('href', '/profile')
})

test('the theme icon in the header cycles light → dark → mixed → light', async () => {
  renderShell()
  const seen = []
  for (let i = 0; i < 3; i++) {
    await userEvent.click(within(sidebar()).getByRole('button', { name: /^Theme:/ }))
    seen.push(document.documentElement.dataset.theme)
  }
  expect(seen).toEqual(['dark', 'mixed', 'light'])
})

test('the collapse button sits outside the sidebar, keeps labels and is remembered', async () => {
  const { unmount } = renderShell()
  const button = screen.getByRole('button', { name: 'Collapse sidebar' })
  expect(sidebar()).not.toContainElement(button)
  await userEvent.click(button)
  expect(within(sidebar()).getByRole('link', { name: 'Home' })).toBeInTheDocument()
  unmount()
  renderShell()
  expect(screen.getByRole('button', { name: 'Expand sidebar' })).toHaveAttribute(
    'aria-expanded',
    'false',
  )
})

test('a bell appears only when a scheduled post is due, and opens the calendar', async () => {
  due = [row({ status: 'approved', scheduled_for: '2026-10-22T08:00:00Z' })]
  renderShell()
  const bell = await within(sidebar()).findByRole('link', { name: '1 post is due' })
  expect(bell).toHaveAttribute('href', '/calendar')
})

test('no bell when nothing is due', async () => {
  renderShell()
  await within(sidebar()).findByText('fetehadin')
  expect(within(sidebar()).queryByRole('link', { name: /due/ })).not.toBeInTheDocument()
})
