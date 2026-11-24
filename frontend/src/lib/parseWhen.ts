import { dateIn } from './time'

/**
 * Typed times for the approve field (FR-52): "wed 2pm", "tomorrow 18:00", "in 2 hours",
 * "26 nov 9am", "friday evening". Everything is read on the user's own clock (their saved
 * zone), and the answer is a wall-clock day and time the caller turns into UTC (rule 6).
 * English only for now; anything it doesn't understand returns null, never a guess, and the
 * screen always repeats the result in words before anything is approved.
 */
export type Parsed = { day: string; time: string }

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
/** Parts of the day, when no clock time is given. */
const PARTS: Record<string, string> = {
  morning: '09:00',
  noon: '12:00',
  midday: '12:00',
  afternoon: '14:00',
  evening: '18:00',
  tonight: '20:00',
  night: '20:00',
  midnight: '00:00',
}
/** Only a day was given: the morning, like a person would assume. */
const DEFAULT_TIME = '09:00'

const pad = (n: number) => String(n).padStart(2, '0')

/** "2026-11-24" + n days, by the calendar (no time zone involved). */
function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

const weekdayOf = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay()

/** The wall clock in the zone at an instant: "14:05". */
function clockIn(at: Date, zone?: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: zone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(at)
}

/** "2pm", "2:30 pm", "14:30", "14h", "at 9" → "HH:MM"; null when the text holds no time. */
function readTime(text: string): { time: string; rest: string } | null {
  const ampm = text.match(/\b(?:at\s+)?(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)/)
  if (ampm) {
    let h = Number(ampm[1])
    const m = Number(ampm[2] ?? 0)
    if (h < 1 || h > 12 || m > 59) return null
    const pm = ampm[3].startsWith('p')
    if (h === 12) h = pm ? 12 : 0
    else if (pm) h += 12
    return { time: `${pad(h)}:${pad(m)}`, rest: text.replace(ampm[0], ' ') }
  }
  const clock = text.match(/\b(?:at\s+)?(\d{1,2})[:.](\d{2})\b|\b(\d{1,2})h\b|\bat\s+(\d{1,2})\b/)
  if (clock) {
    const h = Number(clock[1] ?? clock[3] ?? clock[4])
    const m = Number(clock[2] ?? 0)
    if (h > 23 || m > 59) return null
    return { time: `${pad(h)}:${pad(m)}`, rest: text.replace(clock[0], ' ') }
  }
  for (const [word, time] of Object.entries(PARTS)) {
    const re = new RegExp(`\\b${word}\\b`)
    if (re.test(text)) return { time, rest: text.replace(re, ' ') }
  }
  return null
}

/** The day part: today, tomorrow, a weekday, "next fri", "26 nov", "nov 26", "2026-11-26". */
function readDay(text: string, today: string): { day: string; weekday: boolean } | null | 'none' {
  const t = text.trim()
  if (!t) return 'none'
  if (/^(today|tonight|this)$/.test(t)) return { day: today, weekday: false }
  if (/^(tomorrow|tmrw?|tmw)$/.test(t)) return { day: addDays(today, 1), weekday: false }
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (iso) return { day: t, weekday: false }
  const wd = t.match(/^(next\s+)?(sun|mon|tue|wed|thu|fri|sat)[a-z]*$/)
  if (wd) {
    const want = WEEKDAYS.indexOf(wd[2])
    let ahead = (want - weekdayOf(today) + 7) % 7
    if (wd[1] && ahead === 0) ahead = 7
    return { day: addDays(today, ahead), weekday: !wd[1] && ahead === 0 }
  }
  const dm = t.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3})[a-z]*$/)
  const md = t.match(/^([a-z]{3})[a-z]*\s+(\d{1,2})(?:st|nd|rd|th)?$/)
  const date = dm ? [Number(dm[1]), dm[2]] : md ? [Number(md[2]), md[1]] : null
  if (date) {
    const month = MONTHS.indexOf(date[1] as string)
    const d = date[0] as number
    if (month < 0 || d < 1 || d > 31) return null
    let year = Number(today.slice(0, 4))
    let day = `${year}-${pad(month + 1)}-${pad(d)}`
    // A date that has passed this year means next year's ("3 jan" in December).
    if (day < today) day = `${++year}-${pad(month + 1)}-${pad(d)}`
    // Reject impossible dates like 31 feb (the Date rolls over into March).
    if (new Date(`${day}T12:00:00Z`).toISOString().slice(0, 10) !== day) return null
    return { day, weekday: false }
  }
  return null
}

export function parseWhen(input: string, now = new Date(), zone?: string): Parsed | null {
  const text = input.toLowerCase().replace(/[,]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!text) return null
  const today = dateIn(now, zone)
  const clock = clockIn(now, zone)

  // "in 2 hours", "in 30 min", "in 3 days"
  const rel = text.match(/^in\s+(\d+|an?|one)\s*(m|mins?|minutes?|h|hrs?|hours?|d|days?)$/)
  if (rel) {
    const n = /^\d+$/.test(rel[1]) ? Number(rel[1]) : 1
    const unit = rel[2][0]
    const ms = n * (unit === 'm' ? 60_000 : unit === 'h' ? 3_600_000 : 86_400_000)
    const at = new Date(now.getTime() + ms)
    return { day: dateIn(at, zone), time: clockIn(at, zone) }
  }

  const found = readTime(text)
  const dayText = (found ? found.rest : text).replace(/\b(on|at)\b/g, ' ').trim()
  const day = readDay(dayText.replace(/\s+/g, ' '), today)
  if (day === null) return null
  if (!found && day === 'none') return null
  const time = found?.time ?? (/\btonight\b/.test(text) ? PARTS.tonight : DEFAULT_TIME)

  if (day === 'none') {
    // Only a time: today if it's still ahead, else tomorrow.
    return { day: time > clock ? today : addDays(today, 1), time }
  }
  // "wed 2pm" said on a Wednesday after 2pm means next Wednesday.
  if (day.weekday && day.day === today && time <= clock) return { day: addDays(today, 7), time }
  return { day: day.day, time }
}
