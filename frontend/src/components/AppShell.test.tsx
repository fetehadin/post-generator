import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach } from 'vitest'
import { AppShell } from './AppShell'

beforeEach(() => {
  localStorage.clear()
  delete document.documentElement.dataset.theme
})

const renderShell = () =>
  render(
    <MemoryRouter>
      <AppShell />
    </MemoryRouter>,
  )

const sidebar = () => screen.getAllByRole('navigation', { name: 'Main' })[0].closest('aside')!

test('the sidebar has Home, Calendar, Drafts and Profile (DESIGN.md §2)', () => {
  renderShell()
  const side = within(sidebar())
  for (const name of ['Home', 'Calendar', 'Drafts', 'Profile']) {
    expect(side.getByRole('link', { name })).toBeInTheDocument()
  }
  expect(side.queryByRole('link', { name: 'Voice' })).not.toBeInTheDocument()
})

test('the theme toggle cycles light → dark → mixed → light', async () => {
  renderShell()
  const button = within(sidebar()).getByRole('button', { name: /Theme/ })
  const seen = []
  for (let i = 0; i < 3; i++) {
    await userEvent.click(button)
    seen.push(document.documentElement.dataset.theme)
  }
  expect(seen).toEqual(['dark', 'mixed', 'light'])
})

test('collapsing keeps the labels for screen readers and is remembered', async () => {
  const { unmount } = renderShell()
  await userEvent.click(within(sidebar()).getByRole('button', { name: 'Collapse sidebar' }))
  expect(within(sidebar()).getByRole('link', { name: 'Home' })).toBeInTheDocument()
  unmount()
  renderShell()
  expect(within(sidebar()).getByRole('button', { name: 'Expand sidebar' })).toHaveAttribute(
    'aria-expanded',
    'false',
  )
})
