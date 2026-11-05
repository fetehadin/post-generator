import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router'
import type { Session } from '@supabase/supabase-js'
import { ApiError } from '../api/client'
import { useClaimGuest } from '../api/guest'
import { useMe } from '../api/me'
import { supabase } from '../lib/auth'
import { clearGuest, loadGuest } from '../lib/guest'
import { GuestPage } from '../pages/Guest/GuestPage'
import { InviteStep } from '../pages/Welcome/InviteStep'
import { PrivacyStep } from '../pages/Welcome/PrivacyStep'

/**
 * The way in, in order: logged in (FR-27) → admitted (FR-28; open unless invite-only) →
 * privacy notice accepted (FR-37) → the guest's drafts saved, if any (FR-47) → the app.
 * Logged out, the home page is guest mode; every other page asks to log in. Without
 * Supabase settings (local dev) there's no login step.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(supabase ? undefined : null)

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  const loggedIn = !supabase || Boolean(session)
  const me = useMe(loggedIn && session !== undefined)
  const { pathname } = useLocation()

  if (session === undefined || (loggedIn && me.isPending)) {
    return <p className="p-8 text-muted">Loading…</p>
  }
  if (!loggedIn) return pathname === '/' ? <GuestPage /> : <Navigate to="/login" replace />
  if (me.isError) {
    // The API wants a login but this app has no login settings: say exactly what to fix.
    const loginMissing = !supabase && 'code' in me.error && me.error.code === 'not_logged_in'
    return (
      <p role="alert" className="p-8 text-danger">
        {loginMissing
          ? "Login isn't set up in the app yet. Add SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY to the repo's settings file, then restart npm run dev."
          : me.error.message}
      </p>
    )
  }
  if (!me.data) return <p className="p-8 text-muted">Loading…</p>
  if (!me.data.admitted) return <InviteStep email={me.data.email} />
  if (!me.data.privacy_accepted) return <PrivacyStep />
  return <ClaimGuest>{children}</ClaimGuest>
}

/** Drafts written as a guest in this browser move into the account once, then open. */
function ClaimGuest({ children }: { children: ReactNode }) {
  const claim = useClaimGuest()
  const navigate = useNavigate()
  const started = useRef(false)
  const [pending, setPending] = useState(() => Boolean(loadGuest()?.drafts.length))

  useEffect(() => {
    const guest = loadGuest()
    if (started.current || !guest?.drafts.length) return
    started.current = true
    claim.mutate(
      guest.drafts.map((d) => d.receipt),
      {
        onSuccess: (thread) => {
          clearGuest()
          navigate(`/chat/${thread.id}`, { replace: true })
        },
        onError: (err) => {
          // Changed or too old: they can never be saved, so drop them. Anything else (offline,
          // the server busy) keeps them for the next visit.
          if (err instanceof ApiError && err.code === 'invalid_receipt') clearGuest()
        },
        onSettled: () => setPending(false),
      },
    )
  }, [claim, navigate])

  if (pending) return <p className="p-8 text-muted">Saving the drafts you wrote as a guest…</p>
  return children
}
