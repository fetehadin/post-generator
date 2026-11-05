import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, vi } from 'vitest'
import { ResetPasswordPage } from './ResetPasswordPage'

const auth = vi.hoisted(() => ({ getSession: vi.fn(), updateUser: vi.fn() }))
vi.mock('../../lib/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/auth')>()),
  supabase: { auth },
}))

beforeEach(() => vi.clearAllMocks())

function renderReset() {
  return render(
    <MemoryRouter initialEntries={['/reset-password']}>
      <Routes>
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/" element={<p>Home</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

test('a valid reset link lets you save a new password, then opens the app', async () => {
  auth.getSession.mockResolvedValue({ data: { session: { access_token: 't' } } })
  auth.updateUser.mockResolvedValue({ error: null })
  renderReset()
  await userEvent.type(await screen.findByLabelText('New password'), 'a new long one')
  await userEvent.click(screen.getByRole('button', { name: 'Save password and continue' }))
  expect(auth.updateUser).toHaveBeenCalledWith({ password: 'a new long one' })
  expect(await screen.findByText('Home')).toBeInTheDocument()
})

test('an expired link says so and offers a new one', async () => {
  auth.getSession.mockResolvedValue({ data: { session: null } })
  renderReset()
  expect(await screen.findByRole('alert')).toHaveTextContent('expired')
  expect(screen.getByRole('link', { name: 'Ask for a new link' })).toHaveAttribute('href', '/login')
})
