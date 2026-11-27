/**
 * "Continue with Google" (FR-27) with Google Identity Services (GIS). Google's own button runs on
 * our page and hands back a signed ID token; Supabase checks it (signature, audience = this
 * client, nonce) with signInWithIdToken. No client secret is needed in the browser or on our
 * server, and Google's screen names voxlace.fetehadin.com, not the Supabase project.
 *
 * The client ID is public (it ships in every page). VITE_GOOGLE_CLIENT_ID overrides it, e.g. for
 * a test client; an empty value turns the button off.
 */
const DEFAULT_CLIENT_ID = '329138129581-c0djc9cjeirf0h9uoupqphcejlocvrhu.apps.googleusercontent.com'

export const googleClientId: string =
  (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) ?? DEFAULT_CLIENT_ID

const SCRIPT = 'https://accounts.google.com/gsi/client'

/** The small part of window.google.accounts.id we use. */
type GoogleId = {
  initialize(config: {
    client_id: string
    callback: (response: { credential?: string }) => void
    nonce: string
    ux_mode: 'popup'
    context: 'signin' | 'signup'
    use_fedcm_for_button: boolean
    itp_support: boolean
  }): void
  renderButton(parent: HTMLElement, options: Record<string, string | number>): void
}

declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleId } }
  }
}

let loading: Promise<GoogleId> | null = null

/** Loads Google's script once. Rejects (and allows a retry) when it can't be reached. */
export function loadGoogle(): Promise<GoogleId> {
  const ready = window.google?.accounts?.id
  if (ready) return Promise.resolve(ready)
  loading ??= new Promise<GoogleId>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = SCRIPT
    script.async = true
    script.onload = () => {
      const id = window.google?.accounts?.id
      if (id) resolve(id)
      else reject(new Error('Google sign-in did not load.'))
    }
    script.onerror = () => {
      loading = null
      script.remove()
      reject(new Error("Can't reach Google. Check your connection, or log in with email."))
    }
    document.head.appendChild(script)
  })
  return loading
}

const hex = (buf: ArrayBuffer) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')

/**
 * A fresh nonce pair. Google puts `hashed` into the ID token; we give Supabase `raw`, and
 * Supabase checks that sha256(raw) matches, so a token stolen from another sign-in can't be
 * replayed here.
 */
export async function makeNonce(): Promise<{ raw: string; hashed: string }> {
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  const raw = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
  const hashed = hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw)))
  return { raw, hashed }
}
