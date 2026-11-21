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

const DAY_MS = 24 * 60 * 60 * 1000

/** True while a "Maybe later" for `name` is still in force (it lasts `days` days). */
export function snoozed(name: string): boolean {
  try {
    const until = Number(localStorage.getItem(`voxlace.snooze.${name}`))
    return Number.isFinite(until) && until > Date.now()
  } catch {
    return false
  }
}

export function snooze(name: string, days = 7) {
  try {
    localStorage.setItem(`voxlace.snooze.${name}`, String(Date.now() + days * DAY_MS))
  } catch {
    // private mode: snoozed for this page only (the component hides itself too)
  }
}

/**
 * Call once at startup. The very first visit in this browser marks this tab's session as the
 * first one, so optional prompts (the free key nudge) wait for a later visit.
 */
export function markVisit() {
  try {
    if (!localStorage.getItem('voxlace.seen')) {
      localStorage.setItem('voxlace.seen', '1')
      sessionStorage.setItem('voxlace.firstSession', '1')
    }
  } catch {
    // storage off: treat every visit as a later one
  }
}

export function isFirstSession(): boolean {
  try {
    return sessionStorage.getItem('voxlace.firstSession') === '1'
  } catch {
    return false
  }
}
