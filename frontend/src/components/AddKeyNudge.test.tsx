import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, vi } from 'vitest'
import { routeApi } from '../test/fakeApi'
import { AddKeyNudge } from './AddKeyNudge'

vi.mock('../api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/client')>()),
  api: vi.fn(),
}))

let keys: unknown[] = []
beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  keys = []
  routeApi({ 'GET /me/ai-keys': () => ({ enabled: true, providers: [], keys }) })
})

const renderNudge = (reason: 'limit' | 'busy' = 'limit') =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <AddKeyNudge reason={reason} />
      </MemoryRouter>
    </QueryClientProvider>,
  )

test('at the limit a returning user gets two equal choices', async () => {
  renderNudge()
  expect(await screen.findByRole('button', { name: 'Add an API key' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Maybe later' })).toBeInTheDocument()
})

test('"Maybe later" leaves one quiet link, never a dead end', async () => {
  renderNudge()
  await userEvent.click(await screen.findByRole('button', { name: 'Maybe later' }))
  expect(screen.queryByRole('button', { name: 'Add an API key' })).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'add an API key' })).toHaveAttribute(
    'href',
    '/profile?tab=connections',
  )
})

test('in the first session there is no offer, only the quiet link at the limit', async () => {
  sessionStorage.setItem('voxlace.firstSession', '1')
  renderNudge()
  expect(await screen.findByRole('link', { name: 'add an API key' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Add an API key' })).not.toBeInTheDocument()
})

test('someone with a working key sees nothing', async () => {
  keys = [{ provider: 'groq', status: 'active' }]
  renderNudge()
  await new Promise((r) => setTimeout(r, 50))
  expect(screen.queryByText(/API key/i)).not.toBeInTheDocument()
})
