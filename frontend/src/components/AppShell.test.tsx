import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, vi } from 'vitest'
import { api } from '../api/client'
import { AppShell } from './AppShell'

vi.mock('../api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/client')>()),
  api: vi.fn(),
}))

beforeEach(() => {
  localStorage.clear()
  delete document.documentElement.dataset.theme
  vi.mocked(api).mockResolvedValue({
    id: 'u1',
    email: 'fetehadin@example.com',
    admitted: true,
    privacy_accepted: true,
  })
})

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
