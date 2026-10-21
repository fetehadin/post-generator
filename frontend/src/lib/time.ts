/**
 * Times are UTC in the API and shown in the user's own zone here (CLAUDE.md rule 6).
 * `<input type="datetime-local">` speaks local wall-clock time without a zone, so these two
 * functions convert at the edge.
 */

const pad = (n: number) => String(n).padStart(2, '0')

/** "2026-10-23T18:00" in the browser's zone, for a datetime-local input. */
export function toLocalInput(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** A datetime-local value (local time) → UTC ISO with "Z" for the API. */
export function fromLocalInput(value: string): string {
  return new Date(value).toISOString()
}

/** Midnight today in the user's zone, as UTC ISO: "today's drafts" means their today. */
export function startOfLocalDay(now = new Date()): string {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

/** The user's own calendar date, "2026-10-22", for a check-in's day. */
export function localDate(now = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

const whenFormat = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

/** "Fri 23 Oct, 18:00" in the user's zone. */
export const formatWhen = (iso: string) => whenFormat.format(new Date(iso))
