import { useState } from 'react'
import { useMe, useSetTimezone } from '../../api/me'
import { input, isZone, primaryButton, ZONE_LIST_ID } from './fields'

/**
 * Profile → About you → your time zone (FR-33, rule 6). Times stay UTC on the server; this
 * zone decides "today", best hours and when reminders arrive. The browser's zone is sent once
 * on first use; change it here when you move or travel for long.
 */
export function TimeZoneField() {
  const me = useMe()
  const set = useSetTimezone()
  const saved = me.data?.timezone ?? 'UTC'
  const browser = Intl.DateTimeFormat().resolvedOptions().timeZone
  const [zone, setZone] = useState<string | null>(null)
  const value = zone ?? saved
  const known = isZone(value)

  return (
    <form
      className="mt-4 flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (known && value !== saved) set.mutate(value, { onSuccess: () => setZone(null) })
      }}
    >
      <label className="min-w-64 flex-1 text-sm">
        Your time zone
        <input
          className={input}
          list={ZONE_LIST_ID}
          value={value}
          onChange={(e) => setZone(e.target.value)}
          aria-describedby="zone-help"
          autoComplete="off"
          spellCheck={false}
        />
      </label>
      <button
        type="submit"
        className={primaryButton}
        disabled={!known || value === saved || set.isPending}
      >
        {set.isPending ? 'Saving…' : 'Save time zone'}
      </button>
      {browser !== saved && (
        <button
          type="button"
          className="min-h-10 text-sm text-muted underline underline-offset-4 disabled:no-underline"
          disabled={set.isPending}
          onClick={() => set.mutate(browser, { onSuccess: () => setZone(null) })}
        >
          Use this device's zone ({browser})
        </button>
      )}
      <p id="zone-help" className="w-full text-sm text-muted">
        {known
          ? 'Best hours, reminders and "today" follow this zone.'
          : 'Pick a zone from the list, like Africa/Addis_Ababa.'}
        {set.isSuccess && !zone && ' Saved.'}
      </p>
      {set.isError && (
        <p role="alert" className="w-full text-sm text-danger">
          {set.error.message}
        </p>
      )}
    </form>
  )
}
