import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, vi } from 'vitest'
import { ApiError } from '../../api/client'
import { calls, routeApi, sent } from '../../test/fakeApi'
import { AIKeys } from './AIKeys'

vi.mock('../../api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/client')>()),
  api: vi.fn(),
}))

const providers = [
  {
    id: 'google',
    name: 'Google Gemini',
    key_url: 'https://aistudio.google.com/apikey',
    used_for: 'Drafts, revisions and reading your imported posts',
  },
  { id: 'groq', name: 'Groq', key_url: 'https://console.groq.com/keys', used_for: 'Drafts' },
]

let keys: Record<string, unknown>[] = []

beforeEach(() => {
  vi.clearAllMocks()
  keys = []
  routeApi({
    'GET /me/ai-keys': () => ({ enabled: true, providers, keys }),
    'PUT /me/ai-keys/:p': (body) => {
      const key = (body as { key: string }).key
      if (key.includes('bad'))
        throw new ApiError(400, 'invalid_key', "Google Gemini didn't accept this key.")
      const saved = {
        provider: 'google',
        last4: key.slice(-4),
        status: 'active',
        last_error: null,
        added_at: '2026-11-19T10:00:00Z',
        last_used_at: null,
      }
      keys = [saved]
      return saved
    },
    'DELETE /me/ai-keys/:p': () => {
      keys = []
      return null
    },
  })
})

function renderKeys() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <AIKeys />
    </QueryClientProvider>,
  )
}

test('a key is pasted as a password, saved, then shown only by its last four', async () => {
  renderKeys()
  const input = await screen.findByLabelText('Your Google Gemini API key')
  expect(input).toHaveAttribute('type', 'password')
  await userEvent.type(input, 'AIzaSy-test-key-0000wxyz')
  await userEvent.click(screen.getAllByRole('button', { name: 'Save key' })[0])
  expect(sent('PUT /me/ai-keys/google')).toEqual([{ key: 'AIzaSy-test-key-0000wxyz' }])
  expect(await screen.findByText('wxyz')).toBeInTheDocument()
  expect(screen.queryByText(/AIzaSy-test-key/)).not.toBeInTheDocument()
})

test('a refused key shows why and keeps what was typed', async () => {
  renderKeys()
  const input = await screen.findByLabelText('Your Google Gemini API key')
  await userEvent.type(input, 'bad-key-000000000000000')
  await userEvent.click(screen.getAllByRole('button', { name: 'Save key' })[0])
  expect(await screen.findByRole('alert')).toHaveTextContent("didn't accept this key")
  expect(input).toHaveValue('bad-key-000000000000000')
})

test('a saved key can be removed', async () => {
  keys = [
    {
      provider: 'google',
      last4: 'wxyz',
      status: 'active',
      last_error: null,
      added_at: '2026-11-19T10:00:00Z',
      last_used_at: '2026-11-19T11:00:00Z',
    },
  ]
  renderKeys()
  await userEvent.click(await screen.findByRole('button', { name: 'Remove' }))
  expect(calls()).toContain('DELETE /me/ai-keys/google')
})

test('a key the provider refused later is flagged', async () => {
  keys = [
    {
      provider: 'google',
      last4: 'wxyz',
      status: 'rejected',
      last_error: '401: API key expired',
      added_at: '2026-11-19T10:00:00Z',
      last_used_at: null,
    },
  ]
  renderKeys()
  expect(await screen.findByText('Not working')).toBeInTheDocument()
  expect(screen.getByRole('alert')).toHaveTextContent('API key expired')
})

test('says so when the feature is off', async () => {
  routeApi({ 'GET /me/ai-keys': () => ({ enabled: false, providers, keys: [] }) })
  renderKeys()
  expect(await screen.findByText(/isn't switched on/)).toBeInTheDocument()
})
