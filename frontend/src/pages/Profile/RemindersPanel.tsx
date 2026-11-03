import { useState } from 'react'
import { useReminders, useSaveReminders } from '../../api/me'
import type { Reminders } from '../../api/types'
import { Chip } from './Chip'
import { input, primaryButton } from './fields'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] // 0 = Monday (docs/API.md)

/**
 * Profile → When you post → check-in reminders (FR-42): on these days at this time (your own
 * clock), the bell asks "What did you do today?". In the app only; no email or bot in V1.
 */
export function RemindersPanel() {
  const reminders = useReminders()
  if (reminders.isPending) return <p className="mt-4 text-sm text-muted">Loading…</p>
  if (reminders.isError)
    return (
      <p role="alert" className="mt-4 text-danger">
        {reminders.error.message}
      </p>
    )
  return <RemindersForm initial={reminders.data} />
}

function RemindersForm({ initial }: { initial: Reminders }) {
  const save = useSaveReminders()
  const [r, setR] = useState(initial)
  const [saved, setSaved] = useState(false)
  const change = (next: Partial<Reminders>) => {
    setSaved(false)
    setR({ ...r, ...next })
  }

  return (
    <form
      className="mt-4 flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        save.mutate(r, { onSuccess: () => setSaved(true) })
      }}
    >
      <label className="flex min-h-10 items-center gap-3 text-sm">
        <input
          type="checkbox"
          className="size-5"
          checked={r.enabled}
          onChange={(e) => change({ enabled: e.target.checked })}
        />
        Remind me to check in
      </label>
      <fieldset disabled={!r.enabled} className="flex flex-col gap-4 disabled:opacity-60">
        <legend className="sr-only">Reminder days and time</legend>
        <div role="group" aria-label="Days" className="flex flex-wrap gap-2">
          {DAYS.map((d, i) => {
            const on = r.days.includes(i)
            return (
              <Chip
                key={d}
                on={on}
                className="min-w-12 px-3"
                onClick={() =>
                  change({
                    days: on ? r.days.filter((x) => x !== i) : [...r.days, i].sort((a, b) => a - b),
                  })
                }
              >
                {d}
              </Chip>
            )
          })}
        </div>
        <label className="w-40 text-sm">
          At
          <input
            className={input}
            type="time"
            value={r.local_time}
            onChange={(e) => change({ local_time: e.target.value })}
          />
        </label>
      </fieldset>
      {r.enabled && !r.days.length && (
        <p className="text-sm text-muted">Pick at least one day, or turn reminders off.</p>
      )}
      {save.isError && (
        <p role="alert" className="text-sm text-danger">
          {save.error.message}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          className={primaryButton}
          disabled={save.isPending || (r.enabled && !r.days.length)}
        >
          {save.isPending ? 'Saving…' : 'Save reminders'}
        </button>
        <p role="status" className="text-sm text-muted">
          {saved && 'Saved.'}
        </p>
      </div>
    </form>
  )
}
