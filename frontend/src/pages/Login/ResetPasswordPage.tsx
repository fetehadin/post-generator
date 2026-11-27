import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router'
import { authMessage, supabase } from '../../lib/auth'
import { AuthShell, authField, authPrimary } from './AuthShell'

/**
 * FR-27: the reset link in the email lands here, already logged in for this one purpose
 * (Supabase reads the link's token on load). Choose a new password, then go to the app.
 */
export function ResetPasswordPage() {
  const navigate = useNavigate()
  const [ready, setReady] = useState<boolean | undefined>(undefined)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => setReady(Boolean(data.session)))
  }, [])

  if (!supabase) return <Navigate to="/" replace />
  if (ready === undefined) return <p className="p-8 text-muted">Loading…</p>

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      const { error: err } = await supabase!.auth.updateUser({ password })
      if (err) return setError(authMessage(err))
      navigate('/', { replace: true })
    } catch (err) {
      setError(authMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell
      title="Choose a new password"
      lead={ready ? "Pick one you haven't used here before." : undefined}
    >
      {!ready ? (
        <>
          <p role="alert" className="text-center text-danger">
            This reset link has expired or was already used.
          </p>
          <Link to="/login" className={`${authPrimary} mt-8`}>
            Ask for a new link
          </Link>
        </>
      ) : (
        <form
          className="flex flex-col"
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <label htmlFor="new-password" className="text-sm font-semibold">
            New password
          </label>
          <input
            id="new-password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-describedby="new-password-help"
            className={`${authField} mt-2`}
          />
          <p id="new-password-help" className="mt-2 text-xs text-muted">
            At least 8 characters.
          </p>
          {error && (
            <p role="alert" className="mt-4 text-sm text-danger">
              {error}
            </p>
          )}
          <button type="submit" disabled={busy} className={`${authPrimary} mt-6`}>
            {busy ? 'One moment…' : 'Save password and continue'}
          </button>
        </form>
      )}
    </AuthShell>
  )
}
