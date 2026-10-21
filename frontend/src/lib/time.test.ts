import { fromLocalInput, localDate, startOfLocalDay, toLocalInput } from './time'

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
