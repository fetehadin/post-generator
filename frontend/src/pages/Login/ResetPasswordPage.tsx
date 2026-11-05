import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router'
import { authMessage, supabase } from '../../lib/auth'

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
    <main className="mx-auto max-w-md px-4 py-16">
      <p className="text-xl font-semibold tracking-tight">Voxlace</p>
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">Choose a new password</h1>
      {!ready ? (
        <>
          <p role="alert" className="mt-4 text-danger">
            This reset link has expired or was already used.
          </p>
          <Link to="/login" className="mt-6 inline-block text-thread underline underline-offset-4">
            Ask for a new link
          </Link>
        </>
      ) : (
        <form
          className="mt-8 flex flex-col gap-3"
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
            className="min-h-10 rounded-control border border-edge bg-surface px-3"
          />
          <p className="text-xs text-muted">At least 8 characters.</p>
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="mt-2 min-h-10 rounded-control bg-primary px-4 text-sm font-semibold text-on-primary disabled:bg-sunken disabled:text-muted"
          >
            {busy ? 'One moment…' : 'Save password and continue'}
          </button>
        </form>
      )}
    </main>
  )
}
