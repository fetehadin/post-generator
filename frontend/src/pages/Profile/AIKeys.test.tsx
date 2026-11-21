import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, vi } from 'vitest'
import { type AIProviderInfo, detectProvider } from '../../api/aiKeys'
import { ApiError } from '../../api/client'
import { calls, routeApi, sent } from '../../test/fakeApi'
import { AIKeys } from './AIKeys'

vi.mock('../../api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/client')>()),
  api: vi.fn(),
}))

const provider = (id: string, name: string, prefix: string, free: boolean) => ({
  id,
  name,
  key_url: `https://${id}.example/keys`,
  default_model: `${id}-model`,
  used_for: 'Drafts and revisions',
  prefix,
  hint: prefix.replace(/^\^/, '').replace(/\(.*$/, ''),
  free,
  steps: free ? ['Sign in.', 'Create a key.', 'Copy the key and paste it here.'] : [],
  note: free ? `${name} is free.` : `Paid: billed per use by ${name}.`,
})
const providers = [
  provider('google', 'Google Gemini', '^AIza', true),
  provider('groq', 'Groq', '^gsk_', true),
  provider('openrouter', 'OpenRouter', '^sk-or-', true),
  provider('anthropic', 'Anthropic (Claude)', '^sk-ant-', false),
  provider('openai', 'OpenAI', '^sk-(?!or-|ant-)', false),
  provider('mistral', 'Mistral', '', false),
]

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
        throw new ApiError(
          400,
          'quota_exceeded',
          'This key is out of free quota. Try again later or use another provider.',
        )
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

test('the provider is told from how a key starts', () => {
  const id = (k: string) => detectProvider(k, providers as AIProviderInfo[])?.id
  expect(id('AIzaSyA-fake')).toBe('google')
  expect(id('  gsk_fake ')).toBe('groq')
  expect(id('sk-or-v1-fake')).toBe('openrouter')
  expect(id('sk-ant-api03-fake')).toBe('anthropic')
  expect(id('sk-proj-fake')).toBe('openai')
  expect(id('3f9c0a7b-mistral-like')).toBeUndefined()
})

test('free services come first as cards; paid ones are folded away', async () => {
  renderKeys()
  expect(await screen.findByText("Don't have a key yet?")).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Get free Gemini key ↗' })).toHaveAttribute(
    'href',
    'https://google.example/keys',
  )
  expect(screen.getByRole('link', { name: 'Get free Groq key ↗' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Get free OpenRouter key ↗' })).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: /Get free OpenAI/ })).not.toBeInTheDocument()
  expect(screen.getByText('Other providers')).toBeInTheDocument()
  expect(
    screen.getByText('Stored encrypted. Only used to write your drafts. Remove it anytime.', {
      exact: false,
    }),
  ).toBeInTheDocument()
})

test('"What is an API key?" says a subscription is not a key', async () => {
  renderKeys()
  await userEvent.click(await screen.findByRole('button', { name: 'What is an API key?' }))
  expect(await screen.findByText(/subscription is/)).toHaveTextContent(
    'A ChatGPT Plus, Claude Pro or Gemini subscription is not a key.',
  )
})

test('a pasted key is recognised and checked at once, then shown only masked', async () => {
  renderKeys()
  const input = await screen.findByLabelText('Paste your free key')
  expect(input).toHaveAttribute('type', 'password')
  await userEvent.click(input)
  await userEvent.paste('gsk_fake-fake-fake-fake-zz11')
  expect(sent('PUT /me/ai-keys/groq')).toEqual([
    { key: 'gsk_fake-fake-fake-fake-zz11', model: null },
  ])
  expect(await screen.findByRole('status')).toHaveTextContent(
    'Groq key works. Your own key is active: no daily limit.',
  )
  expect(await screen.findByText('sk-…zz11')).toBeInTheDocument()
  expect(screen.queryByText(/fake-fake/)).not.toBeInTheDocument()
})

test('a key of no known shape asks which service, with an optional model', async () => {
  renderKeys()
  await userEvent.type(
    await screen.findByLabelText('Paste your free key'),
    'not-a-real-mistral-key',
  )
  await userEvent.selectOptions(screen.getByLabelText(/Which service/), 'mistral')
  await userEvent.click(screen.getByText('Advanced: choose a model'))
  await userEvent.type(screen.getByLabelText(/Model/), 'mistral-x')
  await userEvent.click(screen.getByRole('button', { name: 'Check the key' }))
  expect(sent('PUT /me/ai-keys/mistral')).toEqual([
    { key: 'not-a-real-mistral-key', model: 'mistral-x' },
  ])
})

test('a refused key says what to do, offers another free service and keeps the input', async () => {
  renderKeys()
  const input = await screen.findByLabelText('Paste your free key')
  await userEvent.type(input, 'AIza-bad-key-0000000000')
  await userEvent.click(screen.getByRole('button', { name: 'Check the key' }))
  const status = await screen.findByText(/out of free quota/)
  expect(status).toHaveTextContent('This key is out of free quota.')
  expect(screen.getByRole('status')).toContainElement(
    screen.getAllByRole('link', { name: 'Get free Groq key ↗' })[0],
  )
  expect(input).toHaveValue('AIza-bad-key-0000000000')
})

test('a saved key shows its model and can be removed', async () => {
  keys = [savedKey({ model: 'gpt-x' })]
  renderKeys()
  expect(await screen.findByText(/gpt-x/)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Remove OpenAI key' }))
  expect(calls()).toContain('DELETE /me/ai-keys/openai')
})

test('a key the provider refused later is flagged in plain words, never the raw reply', async () => {
  keys = [savedKey({ status: 'rejected', last_error: '401: key expired' })]
  renderKeys()
  expect(await screen.findByText('Not working')).toBeInTheDocument()
  expect(screen.getByRole('alert')).toHaveTextContent('OpenAI stopped accepting this key.')
  expect(screen.queryByText(/401/)).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Replace the key' })).toHaveAttribute('href', '#add-key')
})

test('says so when the feature is off', async () => {
  routeApi({ 'GET /me/ai-keys': () => ({ enabled: false, providers, keys: [] }) })
  renderKeys()
  expect(await screen.findByText(/isn't switched on/)).toBeInTheDocument()
})
