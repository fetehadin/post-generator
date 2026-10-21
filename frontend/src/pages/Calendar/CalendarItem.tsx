import { useState } from 'react'
import { Link } from 'react-router'
import type { usePatchAnyDraft } from '../../api/drafts'
import type { DraftRow } from '../../api/types'
import { PlatformMark } from '../../components/PlatformMark'
import { LABEL } from '../../lib/platforms'
import { fromLocalInput, toLocalInput } from '../../lib/time'

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' })

/** What happens at the time (DESIGN.md §4.3). Telegram sending arrives with the worker. */
const AT_TIME = { telegram: 'Sends automatically', x: 'Reminder', linkedin: 'Reminder' } as const

type Props = { draft: DraftRow; patch: ReturnType<typeof usePatchAnyDraft>; compact?: boolean }

/**
 * One scheduled post. Drag it to another slot, or use "Move to…" (no dragging needed,
 * WCAG 2.5.7). "Posted" marks it published and clears it from the calendar (FR-12, FR-15).
 */
export function CalendarItem({ draft, patch, compact = false }: Props) {
  const [moving, setMoving] = useState(false)
  const [when, setWhen] = useState(() => toLocalInput(draft.scheduled_for!))
  const firstLine = draft.text.split('\n').find((l) => l.trim()) ?? ''
  const time = timeFormat.format(new Date(draft.scheduled_for!))

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', draft.id)
        e.dataTransfer.effectAllowed = 'move'
      }}
      aria-label={`${LABEL[draft.platform]} at ${time}`}
      className="cursor-grab rounded-control border border-line border-l-2 border-l-thread bg-surface p-2 text-xs shadow-[0_1px_2px_rgb(0_0_0/0.04)] active:cursor-grabbing"
    >
      <Link to={`/drafts/${draft.id}`} className="flex items-center gap-1.5 hover:underline">
        <PlatformMark platform={draft.platform} />
        <span className="font-semibold tabular-nums">{time}</span>
        <span className="min-w-0 truncate">{firstLine}</span>
      </Link>
      {!compact && <p className="mt-1 text-muted">{AT_TIME[draft.platform]}</p>}
      {moving ? (
        <form
          className="mt-2 flex flex-wrap gap-1"
          onSubmit={(e) => {
            e.preventDefault()
            patch.mutate(
              { id: draft.id, scheduled_for: fromLocalInput(when) },
              { onSuccess: () => setMoving(false) },
            )
          }}
        >
          <label className="sr-only" htmlFor={`move-${draft.id}`}>
            New time (your time)
          </label>
          <input
            id={`move-${draft.id}`}
            type="datetime-local"
            min={toLocalInput(new Date().toISOString())}
            value={when}
            onChange={(e) => setWhen(e.target.value)}
            className="min-h-8 w-full rounded-control border border-edge bg-surface px-1"
          />
          <button
            type="submit"
            className="min-h-8 rounded-control bg-thread px-2 font-semibold text-on-thread"
          >
            Move
          </button>
          <button
            type="button"
            onClick={() => setMoving(false)}
            className="min-h-8 px-2 text-muted"
          >
            Cancel
          </button>
        </form>
      ) : (
        <div className="mt-1 flex gap-1">
          <button
            type="button"
            onClick={() => setMoving(true)}
            className="min-h-7 rounded-control px-1.5 text-muted hover:bg-sunken hover:text-ink"
          >
            Move to…
          </button>
          <button
            type="button"
            disabled={patch.isPending}
            onClick={() => patch.mutate({ id: draft.id, status: 'published' })}
            className="ml-auto min-h-7 rounded-control border border-edge px-2 font-semibold hover:bg-sunken"
          >
            Posted
          </button>
        </div>
      )}
    </div>
  )
}
