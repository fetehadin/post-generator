import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Login with Supabase (FR-27). Supabase only does the login; the token goes to our API as
 * `Authorization: Bearer`. The publishable key is public by design: it's safe in VITE_ vars.
 * With no Supabase settings (local development), there's no login and the API uses its dev user.
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
