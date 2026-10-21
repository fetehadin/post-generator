import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, vi } from 'vitest'
import { calls, routeApi, sent } from '../../test/fakeApi'
import { AccountSettings } from './AccountSettings'

vi.mock('../../api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/client')>()),
  api: vi.fn(),
}))

beforeEach(() => {
  vi.clearAllMocks()
  routeApi({
    'GET /me/usage': () => ({
      drafts: 12,
      draft_limit: 40,
      posts: 412,
      post_limit: 3000,
      resets_at: '2026-10-23T00:00:00Z',
    }),
    'GET /me/export': () => ({ posts: [] }),
    'DELETE /me': () => null,
  })
})

function renderSettings() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AccountSettings />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

test("shows today's usage against the limits", async () => {
  renderSettings()
  expect(await screen.findByText(/drafts and revisions/)).toHaveTextContent(
    'Today: 12 of 40 drafts and revisions, 412 of 3000 posts learned.',
  )
})

test('export downloads a file', async () => {
  const createURL = vi.fn(() => 'blob:x')
  Object.assign(URL, { createObjectURL: createURL, revokeObjectURL: vi.fn() })
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  renderSettings()
  await userEvent.click(screen.getByRole('button', { name: 'Export my data' }))
  await vi.waitFor(() => expect(click).toHaveBeenCalled())
  expect(calls()).toContain('GET /me/export')
})

test('delete only works after typing "delete"', async () => {
  renderSettings()
  await userEvent.click(screen.getByRole('button', { name: 'Delete all my data…' }))
  const go = screen.getByRole('button', { name: 'Delete everything' })
  expect(go).toBeDisabled()
  await userEvent.type(screen.getByLabelText(/to confirm/), 'delet')
  expect(go).toBeDisabled()
  await userEvent.type(screen.getByLabelText(/to confirm/), 'e')
  await userEvent.click(go)
  expect(await screen.findByText(/Everything is deleted/)).toBeInTheDocument()
  expect(sent('DELETE /me')).toEqual([{ confirm: 'delete' }])
})
