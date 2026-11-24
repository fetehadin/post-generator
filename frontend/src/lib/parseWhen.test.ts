import { parseWhen } from './parseWhen'

// Wednesday 25 Nov 2026, 11:00 in Addis Ababa (UTC+3).
const now = new Date('2026-11-25T08:00:00Z')
const zone = 'Africa/Addis_Ababa'
const p = (text: string) => parseWhen(text, now, zone)

test.each([
  ['wed 2pm', '2026-11-25', '14:00'],
  ['wed 9am', '2026-12-02', '09:00'], // a Wednesday time already passed → next week
  ['next wed 2pm', '2026-12-02', '14:00'],
  ['fri', '2026-11-27', '09:00'],
  ['friday evening', '2026-11-27', '18:00'],
  ['Thursday at 14:30', '2026-11-26', '14:30'],
  ['tomorrow 18:00', '2026-11-26', '18:00'],
  ['tmrw 7pm', '2026-11-26', '19:00'],
  ['today noon', '2026-11-25', '12:00'],
  ['tonight', '2026-11-25', '20:00'],
  ['3pm', '2026-11-25', '15:00'],
  ['10am', '2026-11-26', '10:00'], // only a time that has passed → tomorrow
  ['at 9', '2026-11-26', '09:00'],
  ['12am', '2026-11-26', '00:00'],
  ['12pm', '2026-11-25', '12:00'],
  ['26 nov 9am', '2026-11-26', '09:00'],
  ['dec 3rd 6:15 pm', '2026-12-03', '18:15'],
  ['3 jan', '2027-01-03', '09:00'], // passed this year → next year
  ['2026-12-01 08:00', '2026-12-01', '08:00'],
  ['in 2 hours', '2026-11-25', '13:00'],
  ['in 30 min', '2026-11-25', '11:30'],
  ['in a day', '2026-11-26', '11:00'],
])('%s → %s %s', (text, day, time) => {
  expect(p(text)).toEqual({ day, time })
})

test.each(['', 'whenever', 'blursday 2pm', '25:00', '13pm', '31 feb', 'wed 2pm and fri'])(
  '%s is not understood (null, never a guess)',
  (text) => {
    expect(p(text)).toBeNull()
  },
)

test('the zone decides "today": late evening UTC is already tomorrow in Addis Ababa', () => {
  const late = new Date('2026-11-25T22:30:00Z') // 01:30 Thu in Addis Ababa
  expect(parseWhen('9am', late, zone)).toEqual({ day: '2026-11-26', time: '09:00' })
  expect(parseWhen('9am', late, 'UTC')).toEqual({ day: '2026-11-26', time: '09:00' })
  expect(parseWhen('11pm', late, 'UTC')).toEqual({ day: '2026-11-25', time: '23:00' })
})
