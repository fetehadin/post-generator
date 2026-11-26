import { useState } from 'react'
import { Link } from 'react-router'
import {
  type GitHubDigest,
  type GitHubFrequency,
  type GitHubStatus,
  githubLink,
  useDisconnectGitHub,
  useGitHub,
  usePostAnyway,
  useSetFrequency,
  useSetMention,
} from '../../api/github'

const primary =
  'inline-flex min-h-10 items-center rounded-full bg-primary px-4 text-sm font-semibold text-on-primary disabled:cursor-not-allowed disabled:bg-sunken disabled:text-muted'
const FREQUENCIES: Array<[GitHubFrequency, string]> = [
  ['daily', 'Every evening'],
  ['weekly', 'Weekly, on Friday'],
  ['highlights', 'Only big days'],
]
const day = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' })

/**
 * Profile → GitHub (FR-14): optional. Connect GitHub and Voxlace suggests posts from the day's
 * real work, in the evening, as drafts you edit and approve. Nothing is ever posted for you.
 */
export function GitHubPanel() {
  const gh = useGitHub()
  if (gh.isPending) return <p className="mt-4 text-sm text-muted">Loading…</p>
  if (gh.isError)
    return (
      <p role="alert" className="mt-4 text-sm text-danger">
        {gh.error.message}
      </p>
    )
  if (!gh.data.enabled)
    return (
      <p className="mt-4 text-sm text-muted">
        Connecting GitHub isn't switched on for this app yet.
      </p>
    )
  return gh.data.connected ? <Connected status={gh.data} /> : <Connect />
}

function GoTo({
  kind,
  label,
  solid,
}: {
  kind: 'connect' | 'install'
  label: string
  /** The main button; otherwise a text link, for the one-line "Include private repos". */
  solid?: boolean
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return (
    <span className={solid ? 'block' : 'inline'}>
      <button
        type="button"
        disabled={busy}
        className={solid ? primary : 'min-h-11 text-thread underline'}
        onClick={async () => {
          setBusy(true)
          setError('')
          try {
            window.location.assign(await githubLink(kind))
          } catch (e) {
            setError((e as Error).message)
            setBusy(false)
          }
        }}
      >
        {busy ? 'Opening GitHub…' : label}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </span>
  )
}

function Connect() {
  return (
    <div className="mt-4 flex flex-col gap-3">
      <p className="text-sm">
        Each evening Voxlace looks at what you pushed and suggests drafts when it's worth sharing.
        Public activity only, and it never posts anything.
      </p>
      <GoTo kind="connect" label="Connect GitHub" solid />
    </div>
  )
}

function Connected({ status }: { status: GitHubStatus }) {
  const frequency = useSetFrequency()
  const disconnect = useDisconnectGitHub()
  const [confirming, setConfirming] = useState(false)

  return (
    <div className="mt-3 flex flex-col gap-5">
      <p className="text-sm">
        Connected as <b>@{status.login}</b>
        {status.private_repos ? ', with private repos.' : '. Public repos only.'}{' '}
        {status.private_enabled && !status.private_repos && (
          <GoTo kind="install" label="Include private repos" />
        )}
      </p>

      <label className="text-sm">
        How often
        <select
          value={status.frequency}
          onChange={(e) => frequency.mutate(e.target.value as GitHubFrequency)}
          className="mt-1 block min-h-11 w-full rounded-control border border-edge bg-surface px-3 text-sm"
        >
          {FREQUENCIES.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </label>

      <Repos status={status} />
      <Digests digests={status.digests.slice(0, 3)} />

      {confirming ? (
        <div className="flex flex-col gap-2 rounded-panel border border-line p-4 text-sm">
          <p>Removes the link and everything collected from GitHub. Your drafts stay.</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => disconnect.mutate()}
              disabled={disconnect.isPending}
              className="inline-flex min-h-11 items-center rounded-control bg-danger px-4 text-sm font-semibold text-on-primary"
            >
              {disconnect.isPending ? 'Disconnecting…' : 'Disconnect and delete GitHub data'}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="min-h-11 px-3 text-sm text-muted"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="min-h-11 self-start text-sm text-muted underline"
        >
          Disconnect GitHub…
        </button>
      )}
    </div>
  )
}

function Repos({ status }: { status: GitHubStatus }) {
  const mention = useSetMention()
  if (!status.repos.length)
    return (
      <p className="text-sm text-muted">
        No repos yet. They appear after your next push, at the evening check.
      </p>
    )
  return (
    <section aria-labelledby="gh-repos">
      <h3 id="gh-repos" className="text-sm font-semibold">
        Repos OK to mention
      </h3>
      <ul className="mt-1 flex flex-col">
        {status.repos.map((r) => (
          <li key={r.id}>
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={r.mention_ok}
                onChange={(e) => mention.mutate({ id: r.id, mention_ok: e.target.checked })}
              />
              <span className="font-mono">{r.full_name}</span>
              {r.private && <span className="text-muted">private</span>}
            </label>
          </li>
        ))}
      </ul>
    </section>
  )
}

function Digests({ digests }: { digests: GitHubDigest[] }) {
  const anyway = usePostAnyway()
  if (!digests.length) return null
  return (
    <section aria-labelledby="gh-days" className="text-sm">
      <h3 id="gh-days" className="font-semibold">
        Recent days
      </h3>
      <ul className="mt-1 divide-y divide-line">
        {digests.map((d) => (
          <li key={d.id} className="py-2">
            <p>
              <span className="font-semibold">
                {d.kind === 'weekly' ? 'Week to ' : ''}
                {day.format(new Date(`${d.day}T12:00:00`))}
              </span>{' '}
              <span className="text-muted">· {d.reason}</span>
            </p>
            {d.thread_id ? (
              <Link
                to={`/chat/${d.thread_id}`}
                className="inline-flex min-h-11 items-center text-thread underline"
              >
                Open the suggested drafts
              </Link>
            ) : (
              d.based_on.length > 0 && (
                <button
                  type="button"
                  onClick={() => anyway.mutate(d.id)}
                  disabled={anyway.isPending}
                  className="min-h-11 text-thread underline"
                >
                  {anyway.isPending ? 'Writing…' : 'Want to post anyway?'}
                </button>
              )
            )}
          </li>
        ))}
      </ul>
      {anyway.isError && (
        <p role="alert" className="text-sm text-danger">
          {anyway.error.message}
        </p>
      )}
    </section>
  )
}
