import { useState } from 'react'
import { ghost, primary } from '../lib/ui'
import { dateIn, localToUtc } from '../lib/time'

/** "2026-11-24T20:00" on the user's clock: the value a datetime-local input takes. */
function localInput(at: Date, zone?: string): string {
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: zone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(at)
  return `${dateIn(at, zone)}T${time}`
}

/** The next whole hour at least 15 minutes away: a sensible first guess. */
function nextHour(now = new Date()): Date {
  const at = new Date(now.getTime() + 15 * 60_000)
  at.setMinutes(0, 0, 0)
  return new Date(at.getTime() + 60 * 60_000)
}

/** One date-and-time field: pick when it goes out, in the user's own time. */
export function WhenPicker({
  id,
  zone,
  busy,
  initial,
  submit,
  onPick,
  onCancel,
}: {
  id: string
  zone?: string
  busy: boolean
  initial?: string | null
  submit: string
  onPick: (day: string, at?: string) => void
  onCancel: () => void
}) {
  const start = initial && Date.parse(initial) > Date.now() ? new Date(initial) : nextHour()
  const [value, setValue] = useState(localInput(start, zone))
  return (
    <form
      className="mt-3 flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        const [day, time] = value.split('T')
        if (day && time) onPick(day, localToUtc(day, time, zone))
      }}
    >
      <label htmlFor={`when-${id}`} className="sr-only">
        When
      </label>
      <input
        id={`when-${id}`}
        type="datetime-local"
        value={value}
        min={localInput(new Date(), zone)}
        onChange={(e) => setValue(e.target.value)}
        className="min-h-10 rounded-control border border-edge bg-surface px-2 text-sm"
      />
      <button type="submit" disabled={busy || !value} className={primary}>
        {submit}
      </button>
      <button type="button" onClick={onCancel} className={ghost}>
        Cancel
      </button>
    </form>
  )
}
