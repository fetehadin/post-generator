/**
 * Whether the browser can use this IANA zone. Aliases such as Asia/Calcutta count: a browser
 * may report one as its own zone, and the server accepts them.
 */
export function isZone(value: string): boolean {
  if (!value.trim()) return false
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: value })
    return true
  } catch {
    return false
  }
}

/** "Africa/Addis_Ababa" → "Addis Ababa", "America/Argentina/Buenos_Aires" → "Buenos Aires". */
export const cityOf = (zone: string) => (zone.split('/').at(-1) ?? zone).replace(/_/g, ' ')

/** "Addis Ababa time, now 14:05": the zone in words a person recognises. */
export function zoneInWords(zone: string, now = new Date()): string {
  const clock = new Intl.DateTimeFormat('en-GB', {
    timeZone: zone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(now)
  return zone === 'UTC' ? `UTC, now ${clock}` : `${cityOf(zone)} time, now ${clock}`
}
