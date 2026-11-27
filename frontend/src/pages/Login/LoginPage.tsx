import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router'
import { authMessage, supabase } from '../../lib/auth'
import { AuthShell, authField, authPrimary, textLink } from './AuthShell'
import { GoogleButton, googleEnabled } from './GoogleButton'

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
  const [showPassword, setShowPassword] = useState(false)

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
      <AuthShell title="Check your email">
        <p className="text-center text-muted">
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
          className={`${authPrimary} mt-8`}
        >
          Back to log in
        </button>
      </AuthShell>
    )
  }

  const signup = mode === 'signup'
  const forgot = mode === 'forgot'
  const title = signup ? 'Create your account' : forgot ? 'Reset your password' : 'Welcome back'
  const lead = signup
    ? 'Posts for X, LinkedIn and Telegram, written in your own voice. Free to start.'
    : forgot
      ? "Enter your account's email and we'll send you a link to choose a new password."
      : 'Log in to keep writing in your own voice.'
  const action = signup ? 'Create account' : forgot ? 'Send reset link' : 'Log in'
  return (
    <AuthShell title={title} lead={lead}>
      {!forgot && googleEnabled() && (
        <>
          <GoogleButton signup={signup} onSignedIn={() => navigate('/', { replace: true })} />
          <p className="my-6 flex items-center gap-3 text-xs text-muted before:h-px before:flex-1 before:bg-line after:h-px after:flex-1 after:bg-line">
            or
          </p>
        </>
      )}
      <form
        className="flex flex-col"
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
          inputMode="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={`${authField} mt-2`}
        />
        {!forgot && (
          <>
            <div className="mt-5 flex items-baseline justify-between gap-3">
              <label htmlFor="password" className="text-sm font-semibold">
                Password
              </label>
              {mode === 'login' && (
                <button
                  type="button"
                  onClick={() => switchTo('forgot')}
                  className="text-sm text-thread underline-offset-4 hover:underline"
                >
                  Forgot your password?
                </button>
              )}
            </div>
            <div className="relative mt-2">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                required
                minLength={8}
                autoComplete={signup ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-describedby={signup ? 'password-help' : undefined}
                className={`${authField} pr-16`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-pressed={showPassword}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute inset-y-0 right-1 my-auto h-9 rounded-full px-3 text-xs font-semibold text-muted hover:bg-sunken hover:text-ink"
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            {signup && (
              <p id="password-help" className="mt-2 text-xs text-muted">
                At least 8 characters.
              </p>
            )}
          </>
        )}
        {error && (
          <p role="alert" className="mt-4 text-sm text-danger">
            {error}
          </p>
        )}
        {unconfirmed && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void resend()}
            className={`mt-2 self-start text-sm ${textLink}`}
          >
            Send the confirmation email again
          </button>
        )}
        <button type="submit" disabled={busy} className={`${authPrimary} mt-6`}>
          {busy ? 'One moment…' : action}
        </button>
        {signup && (
          <p className="mt-3 text-center text-xs text-muted">
            By creating an account you agree to the{' '}
            <Link to="/terms" className={textLink}>
              terms
            </Link>{' '}
            and{' '}
            <Link to="/privacy" className={textLink}>
              privacy policy
            </Link>
            .
          </p>
        )}
      </form>
      <p className="mt-8 text-center text-sm text-muted">
        {forgot ? 'Remembered it?' : signup ? 'Already have an account?' : 'New here?'}{' '}
        <button
          type="button"
          onClick={() => switchTo(signup || forgot ? 'login' : 'signup')}
          className={`font-semibold ${textLink}`}
        >
          {signup || forgot ? 'Log in' : 'Create an account'}
        </button>
      </p>
      {!forgot && (
        <p className="mt-2 text-center text-sm text-muted">
          Just looking?{' '}
          <Link to="/" className={textLink}>
            Try it without an account
          </Link>
        </p>
      )}
    </AuthShell>
  )
}
