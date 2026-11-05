import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router'
import { authMessage, supabase } from '../../lib/auth'

type Mode = 'login' | 'signup' | 'forgot'

/**
 * FR-27: log in, create an account or reset a forgotten password with Supabase. Works with
 * password managers and paste (WCAG 3.3.8): real autocomplete fields, no puzzles. Invite
 * codes come after (FR-28).
 */
export function LoginPage() {
  const navigate = useNavigate()
  const asked = (useLocation().state as { mode?: Mode } | null)?.mode
  const [mode, setMode] = useState<Mode>(asked === 'signup' ? 'signup' : 'login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [unconfirmed, setUnconfirmed] = useState(false)
  const [sent, setSent] = useState<'confirm' | 'reset' | null>(null)

  if (!supabase) return <Navigate to="/" replace /> // local development: no login
  const auth = supabase.auth
  const home = `${window.location.origin}/`

  async function submit() {
    setBusy(true)
    setError(null)
    setUnconfirmed(false)
    try {
      if (mode === 'forgot') {
        const { error: err } = await auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        })
        if (err) return setError(authMessage(err))
        return setSent('reset')
      }
      if (mode === 'login') {
        const { data, error: err } = await auth.signInWithPassword({ email, password })
        if (err) {
          setUnconfirmed(err.code === 'email_not_confirmed')
          return setError(authMessage(err))
        }
        if (data.session) navigate('/', { replace: true })
        return
      }
      const { data, error: err } = await auth.signUp({
        email,
        password,
        options: { emailRedirectTo: home },
      })
      if (err) return setError(authMessage(err))
      if (data.session) return navigate('/', { replace: true })
      // Supabase hides whether an email is taken: an existing account comes back with no
      // identities and gets no email. Say so, instead of "check your email" forever.
      if (data.user && data.user.identities?.length === 0) {
        return setError('This email already has an account. Log in, or reset your password.')
      }
      setSent('confirm')
    } catch (err) {
      setError(authMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function resend() {
    setBusy(true)
    const { error: err } = await auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: home },
    })
    setBusy(false)
    if (err) return setError(authMessage(err))
    setError(null)
    setUnconfirmed(false)
    setSent('confirm')
  }

  function switchTo(next: Mode) {
    setMode(next)
    setError(null)
    setUnconfirmed(false)
  }

  if (sent) {
    return (
      <main className="mx-auto max-w-md px-4 py-16">
        <h1 className="text-2xl font-semibold tracking-tight">Check your email</h1>
        <p className="mt-2 text-muted">
          {sent === 'confirm'
            ? `We sent a link to ${email}. Open it to confirm your account; it logs you in.`
            : `If ${email} has an account, we sent it a link to choose a new password.`}{' '}
          Nothing there after a few minutes? Look in spam.
        </p>
        <button
          type="button"
          onClick={() => {
            setSent(null)
            switchTo('login')
          }}
          className="mt-6 text-thread underline underline-offset-4"
        >
          Back to log in
        </button>
      </main>
    )
  }

  const signup = mode === 'signup'
  const forgot = mode === 'forgot'
  const title = signup ? 'Create your account' : forgot ? 'Reset your password' : 'Log in'
  const action = signup ? 'Create account' : forgot ? 'Send reset link' : 'Log in'
  return (
    <main className="mx-auto max-w-md px-4 py-16">
      <p className="text-xl font-semibold tracking-tight">Voxlace</p>
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">{title}</h1>
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
        {!forgot && (
          <>
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
          </>
        )}
        {signup && <p className="text-xs text-muted">At least 8 characters.</p>}
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        {unconfirmed && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void resend()}
            className="self-start text-sm text-thread underline underline-offset-4"
          >
            Send the confirmation email again
          </button>
        )}
        <button
          type="submit"
          disabled={busy}
          className="mt-2 min-h-10 rounded-control bg-primary px-4 text-sm font-semibold text-on-primary disabled:bg-sunken disabled:text-muted"
        >
          {busy ? 'One moment…' : action}
        </button>
      </form>
      {mode === 'login' && (
        <button
          type="button"
          onClick={() => switchTo('forgot')}
          className="mt-4 text-sm text-thread underline underline-offset-4"
        >
          Forgot your password?
        </button>
      )}
      <p className="mt-6 text-sm text-muted">
        {mode === 'login' ? 'New here?' : 'Already have an account?'}{' '}
        <button
          type="button"
          onClick={() => switchTo(mode === 'login' ? 'signup' : 'login')}
          className="text-thread underline underline-offset-4"
        >
          {mode === 'login' ? 'Create an account' : 'Log in'}
        </button>
      </p>
      <p className="mt-3 text-sm text-muted">
        Or{' '}
        <Link to="/" className="text-thread underline underline-offset-4">
          try it without an account
        </Link>
        ; nothing is saved until you log in.
      </p>
    </main>
  )
}
