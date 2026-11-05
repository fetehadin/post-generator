import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, vi } from 'vitest'
import { api, ApiError } from '../api/client'
import type { Me } from '../api/me'
import { AuthGate } from './AuthGate'

const auth = vi.hoisted(() => ({ supabase: null as unknown }))
vi.mock('../lib/auth', () => ({
  get supabase() {
    return auth.supabase
  },
  accessToken: async () => null,
}))
vi.mock('../api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/client')>()),
  api: vi.fn(),
}))

const fakeSupabase = (session: unknown) => ({
  auth: {
    getSession: async () => ({ data: { session } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    signOut: vi.fn(),
  },
})
const me = (over: Partial<Me> = {}): Me => ({
  id: 'u1',
  email: 'sam@x.test',
  admitted: true,
  privacy_accepted: true,
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  auth.supabase = null
})

function renderGate(path = '/') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/login" element={<p>Login page</p>} />
          <Route path="/" element={<AuthGate>The app</AuthGate>} />
          <Route path="/calendar" element={<AuthGate>The calendar</AuthGate>} />
          <Route path="/chat/:id" element={<p>The saved chat</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

test('local development without Supabase goes straight in', async () => {
  vi.mocked(api).mockResolvedValue(me())
  renderGate()
  expect(await screen.findByText('The app')).toBeInTheDocument()
})

test('logged out, the home page is guest mode (FR-47)', async () => {
  auth.supabase = fakeSupabase(null)
  renderGate()
  expect(await screen.findByText(/trying Voxlace as a guest/)).toBeInTheDocument()
  expect(api).not.toHaveBeenCalled()
})

test('logged out, any other page goes to the login page', async () => {
  auth.supabase = fakeSupabase(null)
  renderGate('/calendar')
  expect(await screen.findByText('Login page')).toBeInTheDocument()
})

test("after login, the guest's drafts are saved into the account once and opened", async () => {
  localStorage.setItem(
    'voxlace-guest',
    JSON.stringify({ topic: 'Shipped', drafts: [{ platform: 'x', text: 'Hi', receipt: 'r1' }] }),
  )
  auth.supabase = fakeSupabase({ access_token: 't' })
  vi.mocked(api).mockImplementation(async (path) =>
    path === '/me' ? me() : ({ id: 't9' } as never),
  )
  renderGate()
  expect(await screen.findByText('The saved chat')).toBeInTheDocument()
  expect(api).toHaveBeenCalledWith(
    '/threads/claim',
    expect.objectContaining({ body: JSON.stringify({ receipts: ['r1'] }) }),
  )
  expect(localStorage.getItem('voxlace-guest')).toBeNull()
})

test('a new person enters an invite, then accepts the privacy notice, then gets in', async () => {
  auth.supabase = fakeSupabase({ access_token: 't' })
  vi.mocked(api)
    .mockResolvedValueOnce(me({ admitted: false, privacy_accepted: false })) // GET /me
    .mockRejectedValueOnce(new ApiError(400, 'invalid_invite', "That invite code isn't valid."))
    .mockResolvedValueOnce(me({ privacy_accepted: false })) // POST /me/invite
    .mockResolvedValueOnce(me()) // POST /me/privacy-accept
  renderGate()

  const code = await screen.findByLabelText('Invite code')
  await userEvent.type(code, 'nope')
  await userEvent.click(screen.getByRole('button', { name: 'Join Voxlace' }))
  expect(await screen.findByRole('alert')).toHaveTextContent("isn't valid")

  await userEvent.clear(code)
  await userEvent.type(code, 'VX-ABC')
  await userEvent.click(screen.getByRole('button', { name: 'Join Voxlace' }))
  await userEvent.click(await screen.findByRole('button', { name: 'I understand, continue' }))
  expect(await screen.findByText('The app')).toBeInTheDocument()
  expect(vi.mocked(api).mock.calls.map((c) => c[0])).toEqual([
    '/me',
    '/me/invite',
    '/me/invite',
    '/me/privacy-accept',
  ])
})

test('says what to set up when the API wants a login but the app has none', async () => {
  vi.mocked(api).mockRejectedValue(new ApiError(401, 'not_logged_in', 'Log in to continue.'))
  renderGate()
  expect(await screen.findByRole('alert')).toHaveTextContent('SUPABASE_PUBLISHABLE_KEY')
})

test('a failed save keeps the guest drafts for next time, unless they can never be saved', async () => {
  const stored = JSON.stringify({
    topic: 'T',
    drafts: [{ platform: 'x', text: 'Hi', receipt: 'r1' }],
  })
  localStorage.setItem('voxlace-guest', stored)
  auth.supabase = fakeSupabase({ access_token: 't' })
  vi.mocked(api).mockImplementation(async (path) => {
    if (path === '/me') return me()
    throw new ApiError(0, 'network_error', 'Offline')
  })
  const first = renderGate()
  expect(await screen.findByText('The app')).toBeInTheDocument()
  expect(localStorage.getItem('voxlace-guest')).toBe(stored)
  first.unmount()

  vi.mocked(api).mockImplementation(async (path) => {
    if (path === '/me') return me()
    throw new ApiError(400, 'invalid_receipt', 'Too old')
  })
  renderGate()
  expect(await screen.findByText('The app')).toBeInTheDocument()
  expect(localStorage.getItem('voxlace-guest')).toBeNull()
})
