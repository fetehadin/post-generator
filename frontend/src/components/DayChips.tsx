import { useId, useState } from 'react'
import { nextDays } from '../lib/time'

/**
 * "Which day?" (FR-45, DESIGN.md §4.1): the next seven days as chips, plus any other date.
 * Only the day is asked for; the app picks the best free hour and says why.
 */
export function DayChips({
  timeZone,
  onPick,
  busy = false,
  label = 'Which day?',
}: {
  timeZone?: string
  onPick: (date: string) => void
  busy?: boolean
  label?: string
}) {
  const days = nextDays(7, timeZone)
  const [other, setOther] = useState('')
  const dateId = useId()
  const chip =
    'min-h-9 rounded-full border border-edge px-3 text-sm hover:bg-sunken disabled:opacity-50'
  return (
    <div role="group" aria-label={label}>
      <p className="text-sm font-semibold">{label}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {days.map((d) => (
          <button
            key={d.date}
            type="button"
            disabled={busy}
            onClick={() => onPick(d.date)}
            className={chip}
          >
            {d.label}
          </button>
        ))}
      </div>
      <form
        className="mt-3 flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (other) onPick(other)
        }}
      >
        <label htmlFor={dateId} className="text-sm text-muted">
          Another date
        </label>
        <input
          id={dateId}
          type="date"
          min={days[0].date}
          value={other}
          onChange={(e) => setOther(e.target.value)}
          className="min-h-9 rounded-control border border-edge bg-surface px-2 text-sm"
        />
        <button type="submit" disabled={busy || !other} className={chip}>
          Pick this day
        </button>
      </form>
    </div>
  )
}
