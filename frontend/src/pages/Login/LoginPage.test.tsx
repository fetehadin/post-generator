import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, vi } from 'vitest'
import { LoginPage } from './LoginPage'

const auth = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  resend: vi.fn(),
  resetPasswordForEmail: vi.fn(),
}))
vi.mock('../../lib/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/auth')>()),
  supabase: { auth },
}))

beforeEach(() => vi.clearAllMocks())

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<p>Home</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

async function fill(email: string, password: string) {
  await userEvent.type(screen.getByLabelText('Email'), email)
  await userEvent.type(screen.getByLabelText('Password'), password)
}

test('logs in with email and password, then goes home', async () => {
  auth.signInWithPassword.mockResolvedValue({
    data: { session: { access_token: 't' } },
    error: null,
  })
  renderLogin()
  await fill('sam@x.test', 'correct horse')
  await userEvent.click(screen.getByRole('button', { name: 'Log in' }))
  expect(auth.signInWithPassword).toHaveBeenCalledWith({
    email: 'sam@x.test',
    password: 'correct horse',
  })
  expect(await screen.findByText('Home')).toBeInTheDocument()
})

test("shows Supabase's message when the password is wrong", async () => {
  auth.signInWithPassword.mockResolvedValue({
    data: {},
    error: { message: 'Invalid login credentials' },
  })
  renderLogin()
  await fill('sam@x.test', 'wrong password')
  await userEvent.click(screen.getByRole('button', { name: 'Log in' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Invalid login credentials')
})

test('creating an account asks to confirm the email when Supabase requires it', async () => {
  auth.signUp.mockResolvedValue({
    data: { session: null, user: { identities: [{}] } },
    error: null,
  })
  renderLogin()
  await userEvent.click(screen.getByRole('button', { name: 'Create an account' }))
  await fill('new@x.test', 'long enough')
  await userEvent.click(screen.getByRole('button', { name: 'Create account' }))
  expect(await screen.findByText('Check your email')).toBeInTheDocument()
})

test('password fields work with password managers', () => {
  renderLogin()
  expect(screen.getByLabelText('Email')).toHaveAttribute('autocomplete', 'email')
  expect(screen.getByLabelText('Password')).toHaveAttribute('autocomplete', 'current-password')
})

test('a network failure says so in plain words, not "Failed to fetch"', async () => {
  auth.signUp.mockResolvedValue({
    data: {},
    error: { name: 'AuthRetryableFetchError', message: 'Failed to fetch', status: 0 },
  })
  renderLogin()
  await userEvent.click(screen.getByRole('button', { name: 'Create an account' }))
  await fill('new@x.test', 'long enough')
  await userEvent.click(screen.getByRole('button', { name: 'Create account' }))
  expect(await screen.findByRole('alert')).toHaveTextContent("Can't reach the login service")
})

test('signing up with an email that already has an account says so', async () => {
  auth.signUp.mockResolvedValue({
    data: { session: null, user: { identities: [] } },
    error: null,
  })
  renderLogin()
  await userEvent.click(screen.getByRole('button', { name: 'Create an account' }))
  await fill('old@x.test', 'long enough')
  await userEvent.click(screen.getByRole('button', { name: 'Create account' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('already has an account')
})

test('an unconfirmed email can ask for the confirmation email again', async () => {
  auth.signInWithPassword.mockResolvedValue({
    data: {},
    error: { message: 'Email not confirmed', code: 'email_not_confirmed' },
  })
  auth.resend.mockResolvedValue({ error: null })
  renderLogin()
  await fill('new@x.test', 'long enough')
  await userEvent.click(screen.getByRole('button', { name: 'Log in' }))
  await userEvent.click(
    await screen.findByRole('button', { name: 'Send the confirmation email again' }),
  )
  expect(auth.resend).toHaveBeenCalledWith(
    expect.objectContaining({ type: 'signup', email: 'new@x.test' }),
  )
  expect(await screen.findByText('Check your email')).toBeInTheDocument()
})

test('forgot password sends a reset link to the reset page', async () => {
  auth.resetPasswordForEmail.mockResolvedValue({ error: null })
  renderLogin()
  await userEvent.click(screen.getByRole('button', { name: 'Forgot your password?' }))
  expect(screen.queryByLabelText('Password')).not.toBeInTheDocument()
  await userEvent.type(screen.getByLabelText('Email'), 'sam@x.test')
  await userEvent.click(screen.getByRole('button', { name: 'Send reset link' }))
  expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('sam@x.test', {
    redirectTo: `${window.location.origin}/reset-password`,
  })
  expect(await screen.findByText('Check your email')).toBeInTheDocument()
})
