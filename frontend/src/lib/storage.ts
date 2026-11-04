/** A yes/no kept in this browser; `fallback` when unset or when storage is off (private mode). */
export function remembered(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key)
    return v === null ? fallback : v === '1'
  } catch {
    return fallback
  }
}

export function remember(key: string, on: boolean) {
  try {
    localStorage.setItem(key, on ? '1' : '0')
  } catch {
    // private mode: remembered for this page only
  }
}
