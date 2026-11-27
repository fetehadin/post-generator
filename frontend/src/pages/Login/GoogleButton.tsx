import { useEffect, useRef, useState } from 'react'
import { authMessage, supabase } from '../../lib/auth'
import { googleClientId, loadGoogle, makeNonce } from '../../lib/google'

function isDark() {
  const chosen = document.documentElement.dataset.theme
  return chosen ? chosen === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches
}

/**
 * Google's own "Continue with Google" button (FR-27, see lib/google.ts). Google draws it in an
 * iframe, so its look follows Google's brand rules, not our tokens. A Google login for an email
 * that already has a password account signs in to that same account.
 */
export function GoogleButton({ signup, onSignedIn }: { signup: boolean; onSignedIn: () => void }) {
  const box = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const done = useRef(onSignedIn)
  done.current = onSignedIn

  useEffect(() => {
    let live = true
    let resize: ResizeObserver | undefined
    void (async () => {
      try {
        const [google, nonce] = await Promise.all([loadGoogle(), makeNonce()])
        if (!live || !box.current || !supabase) return
        const auth = supabase.auth
        google.initialize({
          client_id: googleClientId,
          nonce: nonce.hashed,
          ux_mode: 'popup',
          context: signup ? 'signup' : 'signin',
          // Google's popup, not Chrome's built-in sheet (FedCM): the sheet always names the
          // site's main domain (fetehadin.com); the popup names the app, Voxlace, once Google
          // has verified our branding.
          use_fedcm_for_button: false,
          itp_support: true,
          callback: ({ credential }) => {
            if (!credential) return setError('Google sign-in was cancelled.')
            setBusy(true)
            setError(null)
            void auth
              .signInWithIdToken({ provider: 'google', token: credential, nonce: nonce.raw })
              .then(({ data, error: err }) => {
                setBusy(false)
                if (err) return setError(authMessage(err))
                if (data.session) done.current()
              })
          },
        })
        // Google draws the button at a fixed pixel width (at most 400), so draw it again when
        // the column changes width (a phone turning, a window resized); otherwise it overflows.
        const el = box.current
        let drawn = 0
        const draw = () => {
          const width = Math.min(el.clientWidth, 400)
          if (!live || !width || width === drawn) return
          drawn = width
          el.replaceChildren()
          google.renderButton(el, {
            type: 'standard',
            theme: isDark() ? 'filled_black' : 'outline',
            size: 'large',
            shape: 'pill',
            text: signup ? 'signup_with' : 'continue_with',
            logo_alignment: 'center',
            locale: 'en', // the app is in English; Google would follow the browser's language
            width,
          })
        }
        draw()
        if (typeof ResizeObserver !== 'undefined') {
          resize = new ResizeObserver(draw)
          resize.observe(el)
        }
      } catch (err) {
        if (live) setError((err as Error).message)
      }
    })()
    return () => {
      live = false
      resize?.disconnect()
    }
  }, [signup])

  return (
    <div className="flex flex-col gap-2">
      {/* color-scheme light: Google's frame is a light page; under our dark page the browser
          would paint it an opaque white box instead of leaving it transparent. */}
      <div ref={box} className="min-h-11 w-full [color-scheme:light]" aria-busy={busy} />
      {busy && <p className="text-sm text-muted">Signing you in…</p>}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  )
}

/** Whether to offer Google at all: a client ID and a login service are both configured. */
export const googleEnabled = () => Boolean(googleClientId && supabase)
