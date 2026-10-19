import { useEffect, useState, type ReactNode } from 'react'
import { Navigate } from 'react-router'
import type { Session } from '@supabase/supabase-js'
import { useMe } from '../api/me'
import { supabase } from '../lib/auth'
import { InviteStep } from '../pages/Welcome/InviteStep'
import { PrivacyStep } from '../pages/Welcome/PrivacyStep'

/**
 * The way in, in order: logged in (FR-27) → admitted with an invite (FR-28) → privacy notice
 * accepted (FR-37) → the app. Without Supabase settings (local dev) there's no login step.
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

  if (session === undefined || (loggedIn && me.isPending)) {
    return <p className="p-8 text-muted">Loading…</p>
  }
  if (!loggedIn) return <Navigate to="/login" replace />
  if (me.isError) {
    return (
      <p role="alert" className="p-8 text-danger">
        {me.error.message}
      </p>
    )
  }
  if (!me.data) return <p className="p-8 text-muted">Loading…</p>
  if (!me.data.admitted) return <InviteStep email={me.data.email} />
  if (!me.data.privacy_accepted) return <PrivacyStep />
  return children
}
