import { cityOf, zoneInWords } from './zones'

test('a zone reads as its city', () => {
  expect(cityOf('Africa/Addis_Ababa')).toBe('Addis Ababa')
  expect(cityOf('America/Argentina/Buenos_Aires')).toBe('Buenos Aires')
  expect(cityOf('UTC')).toBe('UTC')
})

test('the zone in words, with its clock', () => {
  const at = new Date('2026-11-25T08:05:00Z')
  expect(zoneInWords('Africa/Addis_Ababa', at)).toBe('Addis Ababa time, now 11:05')
  expect(zoneInWords('UTC', at)).toBe('UTC, now 08:05')
})
