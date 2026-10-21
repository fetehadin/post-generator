import { addDays, monthWeeks, moveTo, sameDay, startOfWeek, weekDays } from './calendar'

test('weeks start on Monday at local midnight', () => {
  const wed = new Date(2026, 9, 21, 15, 30) // Wed 21 Oct 2026
  const mon = startOfWeek(wed)
  expect([mon.getDate(), mon.getDay(), mon.getHours()]).toEqual([19, 1, 0])
  expect(startOfWeek(new Date(2026, 9, 25, 23)).getDate()).toBe(19) // Sunday belongs to it too
})

test('a week has seven days, Monday to Sunday', () => {
  const days = weekDays(new Date(2026, 9, 19))
  expect(days.map((d) => d.getDate())).toEqual([19, 20, 21, 22, 23, 24, 25])
  expect(sameDay(days[6], addDays(days[0], 6))).toBe(true)
})

test('moving keeps the minutes and returns UTC', () => {
  const iso = new Date(2026, 9, 21, 18, 30).toISOString()
  const moved = new Date(moveTo(iso, new Date(2026, 9, 23), 9))
  expect([moved.getDate(), moved.getHours(), moved.getMinutes()]).toEqual([23, 9, 30])
  expect(moveTo(iso, new Date(2026, 9, 23), 9).endsWith('Z')).toBe(true)
})

test('the month view covers the whole month in full weeks', () => {
  const weeks = monthWeeks(new Date(2026, 9, 15)) // October 2026: Thu 1 to Sat 31
  expect(weeks[0][0].getDate()).toBe(28) // Mon 28 Sep
  expect(weeks.at(-1)!.at(-1)!.getDate()).toBe(1) // Sun 1 Nov
  expect(weeks.every((w) => w.length === 7)).toBe(true)
})
