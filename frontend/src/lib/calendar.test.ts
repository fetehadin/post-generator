import { SLOTS, addDays, dropTime, sameDay, slotOf, startOfWeek, weekDays } from './calendar'

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

test('the week grid has twelve two-hour rows, and an hour belongs to its row', () => {
  expect(SLOTS).toEqual([0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22])
  expect([slotOf(0), slotOf(9), slotOf(13), slotOf(23)]).toEqual([0, 8, 12, 22])
})

test('a drop on the same row of another day keeps the exact time, in UTC', () => {
  const iso = new Date(2026, 9, 20, 9, 40).toISOString() // Tue 09:40
  const moved = dropTime(iso, new Date(2026, 9, 22), 8) // Thu, the 08:00 row
  const t = new Date(moved)
  expect([t.getDate(), t.getHours(), t.getMinutes()]).toEqual([22, 9, 40])
  expect(moved.endsWith('Z')).toBe(true)
})

test("a drop on another row starts at that row's hour", () => {
  const iso = new Date(2026, 9, 20, 9, 40).toISOString()
  const t = new Date(dropTime(iso, new Date(2026, 9, 20), 12))
  expect([t.getDate(), t.getHours(), t.getMinutes()]).toEqual([20, 12, 0])
})
