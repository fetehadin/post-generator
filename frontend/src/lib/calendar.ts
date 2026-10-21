/**
 * Week maths for the calendar, all in the user's own zone. The API speaks UTC; these work on
 * Date objects (which hold an instant) and read local parts with getDate/getHours.
 */

/** Monday 00:00 local of the week that holds `d`. */
export function startOfWeek(d: Date): Date {
  const out = new Date(d)
  out.setHours(0, 0, 0, 0)
  out.setDate(out.getDate() - ((out.getDay() + 6) % 7)) // Sunday is 0; Monday starts the week
  return out
}

export function addDays(d: Date, n: number): Date {
  const out = new Date(d)
  out.setDate(out.getDate() + n) // calendar days: daylight-saving changes keep local times
  return out
}

/** The 7 local days from Monday. */
export function weekDays(monday: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i))
}

export function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

/** A post dropped on `day` at `hour` keeps its minutes: 18:30 dropped on Thu 09:00 → Thu 09:30. */
export function moveTo(iso: string, day: Date, hour: number): string {
  const old = new Date(iso)
  const out = new Date(day)
  out.setHours(hour, old.getMinutes(), 0, 0)
  return out.toISOString()
}

/** The weeks (Mon–Sun) that cover the month holding `d`, for the month view. */
export function monthWeeks(d: Date): Date[][] {
  const first = new Date(d.getFullYear(), d.getMonth(), 1)
  const weeks: Date[][] = []
  for (let monday = startOfWeek(first); ; monday = addDays(monday, 7)) {
    if (monday.getMonth() !== d.getMonth() && weeks.length && monday > first) break
    weeks.push(weekDays(monday))
  }
  return weeks
}
