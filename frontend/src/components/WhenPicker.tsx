import { useState } from 'react'
import { ghost, primary } from '../lib/ui'
import { parseWhen } from '../lib/parseWhen'
import { dateIn, formatWhen, localToUtc } from '../lib/time'

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

/**
 * One date-and-time field: pick when it goes out, in the user's own time. Or type it (FR-52):
 * "wed 2pm", "tomorrow 18:00", "in 2 hours" fills the field and is repeated in words, so the
 * user sees exactly what will be approved; the field stays the one source of truth.
 */
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
  const [typed, setTyped] = useState('')
  const [echo, setEcho] = useState<{ text: string; past: boolean } | null>(null)

  function read(text: string) {
    setTyped(text)
    const got = parseWhen(text, new Date(), zone)
    if (!got) return setEcho(null)
    const utc = localToUtc(got.day, got.time, zone)
    setValue(`${got.day}T${got.time}`)
    setEcho({ text: formatWhen(utc, zone), past: Date.parse(utc) <= Date.now() })
  }

  const [day, time] = value.split('T')
  const past = Boolean(day && time) && Date.parse(localToUtc(day, time, zone)) <= Date.now()
  return (
    <form
      className="mt-3 flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        const [day, time] = value.split('T')
        if (day && time) onPick(day, localToUtc(day, time, zone))
      }}
    >
      <div className="flex w-full flex-col gap-1">
        <label htmlFor={`when-text-${id}`} className="text-xs text-muted">
          Type it, or pick below
        </label>
        <input
          id={`when-text-${id}`}
          value={typed}
          onChange={(e) => read(e.target.value)}
          placeholder="wed 2pm · tomorrow 18:00 · in 2 hours"
          autoComplete="off"
          aria-describedby={`when-echo-${id}`}
          className="min-h-10 rounded-control border border-edge bg-surface px-3 text-sm placeholder:text-muted"
        />
        <p id={`when-echo-${id}`} aria-live="polite" className="min-h-5 text-sm">
          {echo ? (
            echo.past ? (
              <span className="text-danger">{echo.text} has passed. Pick a later time.</span>
            ) : (
              <>
                <span className="font-semibold">{echo.text}</span>{' '}
                <span className="text-muted">your time</span>
              </>
            )
          ) : (
            typed.trim() && (
              <span className="text-muted">
                Not sure what that means. Try "fri 9am" or "tomorrow 18:00".
              </span>
            )
          )}
        </p>
      </div>
      <label htmlFor={`when-${id}`} className="sr-only">
        When
      </label>
      <input
        id={`when-${id}`}
        type="datetime-local"
        value={value}
        min={localInput(new Date(), zone)}
        onChange={(e) => {
          setValue(e.target.value)
          setTyped('')
          setEcho(null)
        }}
        className="min-h-10 rounded-control border border-edge bg-surface px-2 text-sm"
      />
      <button type="submit" disabled={busy || !value || past} className={primary}>
        {submit}
      </button>
      <button type="button" onClick={onCancel} className={ghost}>
        Cancel
      </button>
    </form>
  )
}
