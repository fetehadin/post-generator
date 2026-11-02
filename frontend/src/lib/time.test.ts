import { dateIn, fromLocalInput, localDate, nextDays, startOfLocalDay, toLocalInput } from './time'

test('a local input round-trips through UTC', () => {
  const iso = fromLocalInput('2026-10-23T18:00')
  expect(iso.endsWith('Z')).toBe(true)
  expect(toLocalInput(iso)).toBe('2026-10-23T18:00')
})

test("today's start is local midnight", () => {
  const start = new Date(startOfLocalDay(new Date(2026, 9, 22, 15, 30)))
  expect([start.getHours(), start.getMinutes(), start.getDate()]).toEqual([0, 0, 22])
})

test('the local date has no zone', () => {
  expect(localDate(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
})

test('nextDays starts today on the user’s clock and labels the first two', () => {
  // 23:30 UTC on 2 Nov is already 3 Nov in Addis Ababa (UTC+3).
  const now = new Date('2026-11-02T23:30:00Z')
  const days = nextDays(3, 'Africa/Addis_Ababa', now)
  expect(days.map((d) => d.date)).toEqual(['2026-11-03', '2026-11-04', '2026-11-05'])
  expect(days.slice(0, 2).map((d) => d.label)).toEqual(['Today', 'Tomorrow'])
  expect(dateIn('2026-11-02T23:30:00Z', 'UTC')).toBe('2026-11-02')
})
