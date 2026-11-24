import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, vi } from 'vitest'
import type { GitHubStatus } from '../../api/github'
import { calls, routeApi, sent } from '../../test/fakeApi'
import { GitHubPanel } from './GitHubPanel'

vi.mock('../../api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/client')>()),
  api: vi.fn(),
}))

const base: GitHubStatus = {
  enabled: true,
  private_enabled: true,
  connected: true,
  login: 'octo',
  private_repos: false,
  frequency: 'daily',
  repos: [
    { id: 'r1', full_name: 'octo/app', private: false, mention_ok: true },
    { id: 'r2', full_name: 'octo/secret', private: true, mention_ok: false },
  ],
  digests: [
    {
      id: 'd1',
      day: '2026-11-19',
      kind: 'daily',
      status: 'nothing',
      score: 2,
      reason: 'Nothing worth posting today (1 meaningful commit(s)).',
      angle: null,
      thread_id: null,
      based_on: ['Commit in app: "Small tweak"'],
    },
    {
      id: 'd2',
      day: '2026-11-20',
      kind: 'daily',
      status: 'suggested',
      score: 9,
      reason: 'A real step.',
      angle: 'The new login',
      thread_id: 't1',
      based_on: ['Merged a pull request in app: "Add login"'],
    },
  ],
}

let status: GitHubStatus = base
beforeEach(() => {
  vi.clearAllMocks()
  status = base
  routeApi({
    'GET /github': () => status,
    'PATCH /github/repos/:id': (body) => ({
      ...status,
      repos: status.repos.map((r) => (r.id === 'r2' ? { ...r, ...(body as object) } : r)),
    }),
    'PUT /github/settings': (body) => ({ ...status, ...(body as object) }),
    'POST /github/digests/:id/draft': () => status,
    'DELETE /github': () => null,
  })
})

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <GitHubPanel />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

test('not connected: one button, and it says nothing is ever posted', async () => {
  status = { ...base, connected: false, login: null, repos: [], digests: [] }
  renderPanel()
  expect(await screen.findByRole('button', { name: 'Connect GitHub' })).toBeInTheDocument()
  expect(screen.getByText(/never posts anything/)).toBeInTheDocument()
})

test('private repos start off and can be allowed one by one', async () => {
  renderPanel()
  const secret = await screen.findByRole('checkbox', { name: /octo\/secret/ })
  expect(secret).not.toBeChecked()
  await userEvent.click(secret)
  expect(sent('PATCH /github/repos/r2')).toEqual([{ mention_ok: true }])
})

test('quiet days say so and offer to post anyway; good days link to the drafts', async () => {
  renderPanel()
  expect(await screen.findByText(/Nothing worth posting today/)).toBeInTheDocument()
  // The day's summary is enough; the raw commit lines aren't shown.
  expect(screen.queryByText('Commit in app: "Small tweak"')).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Want to post anyway?' }))
  expect(calls()).toContain('POST /github/digests/d1/draft')
  expect(screen.getByRole('link', { name: 'Open the suggested drafts' })).toHaveAttribute(
    'href',
    '/chat/t1',
  )
})

test('frequency and disconnect', async () => {
  renderPanel()
  await userEvent.selectOptions(await screen.findByLabelText('How often'), 'highlights')
  expect(sent('PUT /github/settings')).toEqual([{ frequency: 'highlights' }])
  await userEvent.click(screen.getByRole('button', { name: 'Disconnect GitHub…' }))
  await userEvent.click(screen.getByRole('button', { name: 'Disconnect and delete GitHub data' }))
  expect(calls()).toContain('DELETE /github')
})
