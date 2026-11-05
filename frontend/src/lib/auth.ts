import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Login with Supabase (FR-27). Supabase only does the login; the token goes to our API as
 * `Authorization: Bearer`. The publishable key is public by design: it's safe in VITE_ vars.
 * With no Supabase settings (local development), there's no login and the API uses its dev user.
 * In production the URL is our own site: the edge Worker forwards /auth/v1/* to Supabase.
 */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

export const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null

/** The current access token, refreshed by Supabase when needed; null when logged out. */
export async function accessToken(): Promise<string | null> {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

/** A login error in plain words. A network failure says "Failed to fetch", which helps no one. */
export function authMessage(err: unknown): string {
  const e = err as { name?: string; message?: string; code?: string; status?: number }
  if (e.name === 'AuthRetryableFetchError' || e.message === 'Failed to fetch' || e.status === 0) {
    return "Can't reach the login service. Check your connection and try again."
  }
  if (e.code === 'email_not_confirmed') {
    return 'Confirm your email first: open the link we sent you.'
  }
  if (e.code === 'over_email_send_rate_limit') {
    return 'We just sent you an email. Wait a minute, then try again.'
  }
  return e.message || 'Something went wrong. Try again.'
}
