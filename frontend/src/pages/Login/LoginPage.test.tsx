import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, vi } from 'vitest'
import { LoginPage } from './LoginPage'

const auth = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
}))
vi.mock('../../lib/auth', () => ({ supabase: { auth }, accessToken: async () => null }))

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
  auth.signUp.mockResolvedValue({ data: { session: null }, error: null })
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
