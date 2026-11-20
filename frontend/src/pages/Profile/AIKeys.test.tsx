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
  ['groq', 'Groq', 'https://console.groq.com/keys', 'openai/gpt-oss-120b'],
  ['openai', 'OpenAI', 'https://platform.openai.com/api-keys', 'gpt-4.1-mini'],
  [
    'anthropic',
    'Anthropic (Claude)',
    'https://platform.claude.com/settings/keys',
    'claude-opus-5-5',
  ],
].map(([id, name, key_url, default_model]) => ({
  id,
  name,
  key_url,
  default_model,
  used_for: 'Drafts',
}))

const savedKey = (over: Record<string, unknown> = {}) => ({
  provider: 'openai',
  last4: 'a9F2',
  masked: 'sk-…a9F2',
  model: null,
  status: 'active',
  last_error: null,
  added_at: '2026-11-19T10:00:00Z',
  last_used_at: null,
  ...over,
})

let keys: Record<string, unknown>[] = []

beforeEach(() => {
  vi.clearAllMocks()
  keys = []
  routeApi({
    'GET /me/ai-keys': () => ({ enabled: true, providers, keys }),
    'PUT /me/ai-keys/:p': (body) => {
      const { key, model } = body as { key: string; model: string | null }
      if (key.includes('bad'))
        throw new ApiError(400, 'invalid_key', "OpenAI didn't accept this key or model.")
      const k = savedKey({ last4: key.slice(-4), masked: `sk-…${key.slice(-4)}`, model })
      keys = [k]
      return k
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

test('says a subscription is not an API key, and links to the chosen provider', async () => {
  renderKeys()
  expect(await screen.findByText(/subscription is/)).toHaveTextContent(
    'A ChatGPT Plus, Claude Pro or Gemini subscription is not an API key.',
  )
  await userEvent.selectOptions(screen.getByLabelText('Provider'), 'anthropic')
  expect(
    screen.getByRole('link', { name: /Anthropic \(Claude\)'s developer console/ }),
  ).toHaveAttribute('href', 'https://platform.claude.com/settings/keys')
  expect(screen.getByLabelText(/Model/)).toHaveAttribute('placeholder', 'claude-opus-5-5')
})

test('a key is pasted as a password with an optional model, then shown only masked', async () => {
  renderKeys()
  await userEvent.selectOptions(await screen.findByLabelText('Provider'), 'openai')
  const input = screen.getByLabelText('API key')
  expect(input).toHaveAttribute('type', 'password')
  await userEvent.type(input, 'sk-fake-fake-fake-fake-zz11')
  await userEvent.type(screen.getByLabelText(/Model/), 'gpt-x')
  await userEvent.click(screen.getByRole('button', { name: 'Check and save' }))
  expect(sent('PUT /me/ai-keys/openai')).toEqual([
    { key: 'sk-fake-fake-fake-fake-zz11', model: 'gpt-x' },
  ])
  expect(await screen.findByRole('status')).toHaveTextContent('works')
  expect(await screen.findByText('sk-…zz11')).toBeInTheDocument()
  expect(screen.queryByText(/sk-fake-fake/)).not.toBeInTheDocument()
})

test('a refused key shows why and keeps what was typed', async () => {
  renderKeys()
  const input = await screen.findByLabelText('API key')
  await userEvent.type(input, 'bad-key-000000000000000')
  await userEvent.click(screen.getByRole('button', { name: 'Check and save' }))
  expect(await screen.findByRole('alert')).toHaveTextContent("didn't accept this key")
  expect(input).toHaveValue('bad-key-000000000000000')
})

test('a saved key shows its model and can be removed', async () => {
  keys = [savedKey({ model: 'gpt-x' })]
  renderKeys()
  expect(await screen.findByText(/gpt-x/)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Remove OpenAI key' }))
  expect(calls()).toContain('DELETE /me/ai-keys/openai')
})

test('a key the provider refused later is flagged', async () => {
  keys = [savedKey({ status: 'rejected', last_error: '401: key expired' })]
  renderKeys()
  expect(await screen.findByText('Not working')).toBeInTheDocument()
  expect(screen.getByRole('alert')).toHaveTextContent('key expired')
})

test('says so when the feature is off', async () => {
  routeApi({ 'GET /me/ai-keys': () => ({ enabled: false, providers, keys: [] }) })
  renderKeys()
  expect(await screen.findByText(/isn't switched on/)).toBeInTheDocument()
})
