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

function renderGate() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/login" element={<p>Login page</p>} />
          <Route path="/" element={<AuthGate>The app</AuthGate>} />
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

test('logged out goes to the login page', async () => {
  auth.supabase = fakeSupabase(null)
  renderGate()
  expect(await screen.findByText('Login page')).toBeInTheDocument()
  expect(api).not.toHaveBeenCalled()
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
