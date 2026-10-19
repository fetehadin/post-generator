import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { supabase } from '../../lib/auth'

/**
 * FR-27: log in or create an account with Supabase. Works with password managers and paste
 * (WCAG 3.3.8): real autocomplete fields, no puzzles. Invite codes come after (FR-28).
 */
export function LoginPage() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [checkEmail, setCheckEmail] = useState(false)

  if (!supabase) return <Navigate to="/" replace /> // local development: no login

  async function submit() {
    setBusy(true)
    setError(null)
    const auth = supabase!.auth
    const { data, error: err } =
      mode === 'login'
        ? await auth.signInWithPassword({ email, password })
        : await auth.signUp({ email, password })
    setBusy(false)
    if (err) return setError(err.message)
    if (data.session) return navigate('/', { replace: true })
    setCheckEmail(true) // sign-up with email confirmation turned on
  }

  if (checkEmail) {
    return (
      <main className="mx-auto max-w-md px-4 py-16">
        <h1 className="text-2xl font-semibold tracking-tight">Check your email</h1>
        <p className="mt-2 text-muted">
          We sent a link to {email}. Open it to confirm your account, then log in here.
        </p>
        <button
          type="button"
          onClick={() => {
            setCheckEmail(false)
            setMode('login')
          }}
          className="mt-6 text-thread underline underline-offset-4"
        >
          Back to log in
        </button>
      </main>
    )
  }

  const signup = mode === 'signup'
  return (
    <main className="mx-auto max-w-md px-4 py-16">
      <p className="text-xl font-semibold tracking-tight">Voxlace</p>
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">
        {signup ? 'Create your account' : 'Log in'}
      </h1>
      <form
        className="mt-8 flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <label htmlFor="email" className="text-sm font-semibold">
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="min-h-10 rounded-control border border-edge bg-surface px-3"
        />
        <label htmlFor="password" className="mt-2 text-sm font-semibold">
          Password
        </label>
        <input
          id="password"
          type="password"
          required
          minLength={8}
          autoComplete={signup ? 'new-password' : 'current-password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="min-h-10 rounded-control border border-edge bg-surface px-3"
        />
        {signup && <p className="text-xs text-muted">At least 8 characters.</p>}
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy}
          className="mt-2 min-h-10 rounded-control bg-thread px-4 text-sm font-semibold text-on-thread disabled:bg-sunken disabled:text-muted"
        >
          {busy ? 'One moment…' : signup ? 'Create account' : 'Log in'}
        </button>
      </form>
      <p className="mt-6 text-sm text-muted">
        {signup ? 'Already have an account?' : 'New here? Voxlace is invite-only.'}{' '}
        <button
          type="button"
          onClick={() => {
            setMode(signup ? 'login' : 'signup')
            setError(null)
          }}
          className="text-thread underline underline-offset-4"
        >
          {signup ? 'Log in' : 'Create an account'}
        </button>
      </p>
    </main>
  )
}
