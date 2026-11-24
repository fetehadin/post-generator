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

const button = 'inline-flex min-h-10 items-center rounded-full border border-edge px-4 text-sm'
const primary =
  'inline-flex min-h-10 items-center rounded-full bg-primary px-4 text-sm font-semibold text-on-primary disabled:cursor-not-allowed disabled:bg-sunken disabled:text-muted'
const FREQUENCIES: Array<[GitHubFrequency, string]> = [
  ['daily', 'Every evening, plus a Friday recap when small days add up'],
  ['weekly', 'A weekly recap on Friday'],
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
  solid?: boolean
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return (
    <div>
      <button
        type="button"
        disabled={busy}
        className={solid ? primary : button}
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
    </div>
  )
}

function Connect() {
  return (
    <div className="mt-4 flex flex-col gap-3">
      <p className="text-sm">
        Connect GitHub and each evening Voxlace looks at what you pushed and merged. When it's worth
        sharing, you get drafts to edit and approve. Quiet days say so. It reads your public
        activity only, and never posts anything.
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
    <div className="mt-4 flex flex-col gap-6">
      <p className="text-sm">
        Connected as <b>@{status.login}</b>.{' '}
        {status.private_repos
          ? 'Private repos are included through the Voxlace app.'
          : 'Public repos only.'}
      </p>

      {status.private_enabled && !status.private_repos && (
        <section aria-labelledby="gh-private" className="rounded-panel border border-line p-4">
          <h3 id="gh-private" className="font-semibold">
            Also include private repos
          </h3>
          <p className="mt-1 text-sm text-muted">
            Install the Voxlace app on your GitHub account and pick the repos. It can only read
            code, pull requests and repo details; it can't change anything. Private repos are never
            mentioned until you allow each one below.
          </p>
          <div className="mt-3">
            <GoTo kind="install" label="Install on GitHub" />
          </div>
        </section>
      )}

      <label className="text-sm">
        How often
        <select
          value={status.frequency}
          onChange={(e) => frequency.mutate(e.target.value as GitHubFrequency)}
          className="mt-1 block min-h-10 w-full rounded-control border border-edge bg-surface px-3 text-sm"
        >
          {FREQUENCIES.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </label>

      <Repos status={status} />
      <Digests digests={status.digests} />

      <section aria-labelledby="gh-off" className="rounded-panel border border-line p-4">
        <h3 id="gh-off" className="font-semibold">
          Disconnect GitHub
        </h3>
        <p className="mt-1 text-sm text-muted">
          Removes the link, the access token and everything collected from GitHub. Drafts you
          already have stay. To remove the app from GitHub too, uninstall it in your GitHub settings
          (Applications).
        </p>
        {confirming ? (
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => disconnect.mutate()}
              disabled={disconnect.isPending}
              className="inline-flex min-h-10 items-center rounded-control bg-danger px-4 text-sm font-semibold text-on-primary"
            >
              {disconnect.isPending ? 'Disconnecting…' : 'Disconnect and delete GitHub data'}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="px-3 text-sm text-muted"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirming(true)} className={`${button} mt-3`}>
            Disconnect GitHub…
          </button>
        )}
      </section>
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
      <h3 id="gh-repos" className="font-semibold">
        Repos
      </h3>
      <p className="mt-1 text-sm text-muted">
        Only repos marked OK are ever named or used for a draft. Private repos start off.
      </p>
      <ul className="mt-2 flex flex-col gap-2">
        {status.repos.map((r) => (
          <li key={r.id}>
            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={r.mention_ok}
                onChange={(e) => mention.mutate({ id: r.id, mention_ok: e.target.checked })}
              />
              <span className="font-mono">{r.full_name}</span>
              <span className="text-muted">
                {r.private ? 'private' : 'public'} · OK to mention publicly
              </span>
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
    <section aria-labelledby="gh-days" className="flex flex-col gap-3">
      <h3 id="gh-days" className="font-semibold">
        Recent days
      </h3>
      {digests.map((d) => (
        <article key={d.id} className="rounded-panel border border-line p-4 text-sm">
          <p className="font-semibold">
            {d.kind === 'weekly' ? 'Week to ' : ''}
            {day.format(new Date(`${d.day}T12:00:00`))} ·{' '}
            {d.status === 'suggested' ? 'Drafts suggested' : 'Nothing worth posting'}
          </p>
          <p className="mt-1 text-muted">{d.reason}</p>
          {d.thread_id ? (
            <Link to={`/chat/${d.thread_id}`} className="mt-2 inline-block text-thread underline">
              Open the suggested drafts
            </Link>
          ) : (
            d.based_on.length > 0 && (
              <button
                type="button"
                onClick={() => anyway.mutate(d.id)}
                disabled={anyway.isPending}
                className={`${button} mt-2`}
              >
                {anyway.isPending ? 'Writing…' : 'Want to post anyway?'}
              </button>
            )
          )}
        </article>
      ))}
      {anyway.isError && (
        <p role="alert" className="text-sm text-danger">
          {anyway.error.message}
        </p>
      )}
    </section>
  )
}
