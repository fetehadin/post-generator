import { useState } from 'react'
import type { DraftChange } from '../../api/drafts'
import type { DraftDetail } from '../../api/types'
import { fromLocalInput, toLocalInput } from '../../lib/time'

/** The next full hour, local time: a sensible default for "when". */
function nextHour(): string {
  const d = new Date()
  d.setHours(d.getHours() + 1, 0, 0, 0)
  return toLocalInput(d.toISOString())
}

const WHAT_HAPPENS = {
  x: 'Voxlace never posts to X for you. At that time it reminds you, and one tap opens X with the text filled in.',
  linkedin:
    'At that time Voxlace reminds you. One tap copies the text and opens LinkedIn for you to paste.',
  telegram:
    "It goes on your calendar. Once your channel is connected, Voxlace's bot posts it at that time.",
} as const

type Props = {
  draft: DraftDetail
  /** "approve" from a draft; "move" to change the time of an approved one. */
  mode: 'approve' | 'move'
  onSave: (change: DraftChange) => void
  onCancel: () => void
  pending: boolean
}

/** "Approve and schedule…": pick a time and say exactly what will happen (DESIGN.md §4.2). */
export function ApprovePanel({ draft, mode, onSave, onCancel, pending }: Props) {
  const [when, setWhen] = useState(
    draft.scheduled_for ? toLocalInput(draft.scheduled_for) : nextHour(),
  )
  const approve = mode === 'approve' ? { status: 'approved' as const } : {}
  return (
    <section
      role="group"
      aria-label={mode === 'approve' ? 'Approve and schedule' : 'Change the time'}
      className="mt-6 rounded-panel border border-thread bg-paper p-4"
    >
      <label htmlFor="when" className="block text-sm font-semibold">
        When (your time)
      </label>
      <input
        id="when"
        type="datetime-local"
        value={when}
        onChange={(e) => setWhen(e.target.value)}
        className="mt-1 min-h-10 rounded-control border border-edge bg-surface px-3 text-sm"
      />
      <p className="mt-3 text-sm text-muted">{WHAT_HAPPENS[draft.platform]}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!when || pending}
          onClick={() => onSave({ ...approve, scheduled_for: fromLocalInput(when) })}
          className="inline-flex min-h-10 items-center rounded-control bg-thread px-4 text-sm font-semibold text-on-thread disabled:bg-sunken disabled:text-muted"
        >
          {mode === 'approve' ? 'Approve and schedule' : 'Save the new time'}
        </button>
        {mode === 'approve' && (
          <button
            type="button"
            disabled={pending}
            onClick={() => onSave({ status: 'approved' })}
            className="inline-flex min-h-10 items-center rounded-control border border-edge px-4 text-sm"
          >
            Approve without a time
          </button>
        )}
        {mode === 'move' && draft.scheduled_for && (
          <button
            type="button"
            disabled={pending}
            onClick={() => onSave({ scheduled_for: null })}
            className="inline-flex min-h-10 items-center rounded-control border border-edge px-4 text-sm"
          >
            Take it off the calendar
          </button>
        )}
        <button type="button" onClick={onCancel} className="min-h-10 px-3 text-sm text-muted">
          Cancel
        </button>
      </div>
    </section>
  )
}
