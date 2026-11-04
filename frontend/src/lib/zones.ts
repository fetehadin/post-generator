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
