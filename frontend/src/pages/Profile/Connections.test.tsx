import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, vi } from 'vitest'
import { routeApi, sent } from '../../test/fakeApi'
import { Connections } from './Connections'

vi.mock('../../api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/client')>()),
  api: vi.fn(),
}))

let channel: string | null = null
let profession = ''
beforeEach(() => {
  channel = null
  profession = ''
  routeApi({
    'GET /platforms/telegram': () => ({ platform: 'telegram', channel }),
    'PUT /platforms/telegram/settings': (b) => {
      channel = String((b as { channel: string }).channel).replace(/^@|^t\.me\//, '')
      return { platform: 'telegram', channel }
    },
    'GET /profile': () => ({ role: 'x', discipline: profession }),
    'GET /me/ai-keys': () => ({ enabled: true, providers: [], keys: [] }),
    'GET /github': () => ({
      enabled: true,
      private_enabled: false,
      connected: false,
      login: null,
      private_repos: false,
      frequency: 'daily',
      repos: [],
      digests: [],
    }),
  })
})

const renderTab = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <Connections />
      </MemoryRouter>
    </QueryClientProvider>,
  )

test('Telegram: the channel is saved here, and shown as the server keeps it (FR-12)', async () => {
  renderTab()
  await userEvent.type(await screen.findByLabelText('Your Telegram channel'), '@fetescript_demo')
  await userEvent.click(screen.getByRole('button', { name: 'Save channel' }))
  expect(sent('PUT /platforms/telegram/settings')).toEqual([{ channel: '@fetescript_demo' }])
  expect(await screen.findByText('Saved.')).toBeInTheDocument()
  expect(screen.getByLabelText('Your Telegram channel')).toHaveValue('fetescript_demo')
})

test('the API key comes first; GitHub is folded away unless you are a developer', async () => {
  renderTab()
  expect(screen.getByRole('heading', { name: 'API key' })).toBeInTheDocument()
  const github = screen.getByText('GitHub').closest('details')!
  await screen.findByLabelText('Your Telegram channel')
  expect(github).not.toHaveAttribute('open')
})

test('a developer sees GitHub open', async () => {
  profession = 'Backend developer'
  renderTab()
  const github = screen.getByText('GitHub').closest('details')!
  await vi.waitFor(() => expect(github).toHaveAttribute('open'))
})
