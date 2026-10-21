import { useState } from 'react'
import { useDeleteCheckin, useCheckins, usePatchCheckin } from '../../api/checkins'
import { useDraftStats } from '../../api/account'
import { useDrafts } from '../../api/drafts'
import type { Checkin, DraftStatus, Platform } from '../../api/types'
import { DraftRowLink } from '../../components/DraftRowLink'
import { LABEL, STATUS_LABEL } from '../../lib/platforms'

const STATUSES: Array<DraftStatus | 'all'> = ['all', 'draft', 'approved', 'published', 'discarded']
const PLATFORMS: Array<Platform | 'all'> = ['all', 'x', 'linkedin', 'telegram']

/** Drafts (DESIGN.md §4.4): every draft by status and platform, plus the check-ins (FR-6, FR-11). */
export function DraftsPage() {
  const [tab, setTab] = useState<'drafts' | 'checkins'>('drafts')
  return (
    <div className="mx-auto max-w-[720px] px-4 py-12 md:px-6 md:py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Drafts</h1>
      <WeekStats />
      <div role="tablist" aria-label="Show" className="mt-6 flex gap-1 border-b border-line">
        {(['drafts', 'checkins'] as const).map((t) => (
          <button
            key={t}
            role="tab"
            type="button"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`-mb-px min-h-10 border-b-2 px-3 text-sm ${
              tab === t ? 'border-thread font-semibold' : 'border-transparent text-muted'
            }`}
          >
            {t === 'drafts' ? 'Drafts' : 'Check-ins'}
          </button>
        ))}
      </div>
      {tab === 'drafts' ? <Library /> : <Checkins />}
    </div>
  )
}

const select = 'min-h-10 rounded-control border border-edge bg-surface px-2 text-sm'

function Library() {
  const [status, setStatus] = useState<DraftStatus | 'all'>('all')
  const [platform, setPlatform] = useState<Platform | 'all'>('all')
  const drafts = useDrafts({
    ...(status !== 'all' && { status }),
    ...(platform !== 'all' && { platform }),
  })
  return (
    <>
      <div className="mt-4 flex flex-wrap gap-2">
        <label className="flex items-center gap-2 text-sm">
          Status
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as DraftStatus | 'all')}
            className={select}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s === 'all' ? 'All' : STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          Platform
          <select
            value={platform}
            onChange={(e) => setPlatform(e.target.value as Platform | 'all')}
            className={select}
          >
            {PLATFORMS.map((p) => (
              <option key={p} value={p}>
                {p === 'all' ? 'All' : LABEL[p]}
              </option>
            ))}
          </select>
        </label>
      </div>
      {drafts.isError && (
        <p role="alert" className="mt-6 text-danger">
          {drafts.error.message}
        </p>
      )}
      {drafts.data &&
        (drafts.data.items.length ? (
          <div className="mt-4 border-t border-line">
            {drafts.data.items.map((d) => (
              <DraftRowLink key={d.id} draft={d} />
            ))}
          </div>
        ) : (
          <p className="mt-6 text-muted">No drafts here yet.</p>
        ))}
    </>
  )
}

const dayFormat = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC', // a check-in's day is a plain date, not a moment in time
})

function Checkins() {
  const checkins = useCheckins()
  if (checkins.isError)
    return (
      <p role="alert" className="mt-6 text-danger">
        {checkins.error.message}
      </p>
    )
  if (!checkins.data) return null
  if (!checkins.data.items.length)
    return <p className="mt-6 text-muted">No check-ins yet. Save one from Home.</p>
  return (
    <ul className="mt-4 flex flex-col">
      {checkins.data.items.map((c) => (
        <CheckinRow key={`${c.id}-${c.updated_at}`} checkin={c} />
      ))}
    </ul>
  )
}

function CheckinRow({ checkin }: { checkin: Checkin }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(checkin.text)
  const patch = usePatchCheckin()
  const remove = useDeleteCheckin()
  const day = dayFormat.format(new Date(`${checkin.day}T00:00:00Z`))
  return (
    <li className="border-b border-line py-3">
      <p className="text-xs text-muted">{day}</p>
      {editing ? (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (text.trim())
              patch.mutate({ id: checkin.id, text }, { onSuccess: () => setEditing(false) })
          }}
        >
          <label htmlFor={`checkin-${checkin.id}`} className="sr-only">
            Check-in text
          </label>
          <textarea
            id={`checkin-${checkin.id}`}
            maxLength={4000}
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="mt-1 block min-h-20 w-full rounded-control border border-edge bg-surface p-2 font-serif [field-sizing:content]"
          />
          <div className="mt-2 flex gap-2">
            <button
              type="submit"
              disabled={patch.isPending || !text.trim()}
              className="min-h-9 rounded-control bg-thread px-3 text-sm font-semibold text-on-thread"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="min-h-9 px-3 text-sm text-muted"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="flex items-start gap-3">
          <p className="flex-1 font-serif whitespace-pre-wrap">{checkin.text}</p>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="min-h-9 px-2 text-sm text-muted hover:text-ink"
          >
            Edit
          </button>
          <button
            type="button"
            disabled={remove.isPending}
            onClick={() => {
              if (window.confirm('Delete this check-in? Drafts made from it stay.'))
                remove.mutate(checkin.id)
            }}
            className="min-h-9 px-2 text-sm text-muted hover:text-danger"
          >
            Delete
          </button>
        </div>
      )}
      {(patch.error ?? remove.error) && (
        <p role="alert" className="mt-1 text-sm text-danger">
          {(patch.error ?? remove.error)?.message}
        </p>
      )}
    </li>
  )
}

const pct = (x: number) => `${Math.round(x * 100)}%`

/** FR-15: did the drafts get posted, and how much were they edited first? */
function WeekStats() {
  const stats = useDraftStats().data
  if (!stats?.created) return null
  return (
    <p className="mt-1 text-sm text-muted">
      Last 7 days: {stats.created} {stats.created === 1 ? 'draft' : 'drafts'}, {stats.published}{' '}
      posted ({pct(stats.publish_rate ?? 0)})
      {stats.edited !== null && `, edited ${pct(stats.edited)} on average before posting`}.
    </p>
  )
}
