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

const formatters = new Map<string, Intl.DateTimeFormat>()

/** One formatter per style and zone: building them is slow, and lists format many rows. */
function formatter(style: 'when' | 'short', timeZone?: string): Intl.DateTimeFormat {
  const key = `${style}|${timeZone ?? ''}`
  let f = formatters.get(key)
  if (!f) {
    f = new Intl.DateTimeFormat(undefined, {
      weekday: 'short',
      ...(style === 'when' && { day: 'numeric', month: 'short' }),
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      timeZone,
    })
    formatters.set(key, f)
  }
  return f
}

/** "Fri 23 Oct, 18:00" in the user's zone (24-hour clock, DESIGN.md §8). */
export const formatWhen = (iso: string, timeZone?: string) =>
  formatter('when', timeZone).format(new Date(iso))

/** "Sat 08:26": a short time for tight places (DESIGN.md §7, missed posts). */
export const formatShort = (iso: string, timeZone?: string) =>
  formatter('short', timeZone).format(new Date(iso))

/** The user's calendar date of an instant, "2026-10-22", in their saved zone. */
export function dateIn(iso: string | Date, timeZone?: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date(iso))
}

export type DayOption = { date: string; label: string }

/**
 * The next `count` days on the user's clock, starting today: the chips for "Which day?"
 * (FR-45). "Today", "Tomorrow", then "Wed 4".
 */
export function nextDays(count: number, timeZone?: string, now = new Date()): DayOption[] {
  const weekday = new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
  const today = dateIn(now, timeZone)
  return Array.from({ length: count }, (_, i) => {
    // Noon UTC on each date, so the label never slips a day across zones.
    const noon = new Date(Date.parse(`${today}T12:00:00Z`) + i * 86_400_000)
    const date = noon.toISOString().slice(0, 10)
    return { date, label: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : weekday.format(noon) }
  })
}
