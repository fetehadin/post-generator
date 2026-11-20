import { useEffect, useRef } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useFinishConnect, useFinishInstall } from '../../api/github'

/**
 * GitHub sends the browser back here (FR-14): after "Connect GitHub" with `code` and `state`,
 * after installing the app for private repos with `installation_id` and `state`. Both are
 * checked on the server against the logged-in user, then we go back to Profile → GitHub.
 */
export function GitHubCallbackPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const connect = useFinishConnect()
  const install = useFinishInstall()
  const sent = useRef(false)
  const code = params.get('code')
  const state = params.get('state') ?? ''
  const installation = Number(params.get('installation_id'))

  useEffect(() => {
    if (sent.current) return // React may run effects twice in development
    sent.current = true
    const done = { onSuccess: () => navigate('/profile?tab=github', { replace: true }) }
    if (installation) install.mutate({ installation_id: installation, state }, done)
    else if (code) connect.mutate({ code, state }, done)
  }, [code, state, installation, connect, install, navigate])

  const error = connect.error ?? install.error
  const nothing = !code && !installation
  return (
    <main className="mx-auto max-w-[560px] px-4 py-16">
      {error || nothing ? (
        <>
          <p role="alert" className="text-danger">
            {error?.message ?? 'GitHub sent nothing to finish. Start again from Profile.'}
          </p>
          <Link to="/profile?tab=github" className="mt-4 inline-block text-thread underline">
            Back to Profile → GitHub
          </Link>
        </>
      ) : (
        <p role="status">Connecting GitHub…</p>
      )}
    </main>
  )
}
