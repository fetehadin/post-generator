import type { GuestDraft } from '../api/guest'

/**
 * A guest's work, in this browser only (FR-47): what they wrote and the drafts they got.
 * Nothing of it is on our server until they log in and it's claimed into their account.
 */
export type GuestSession = { topic: string; drafts: GuestDraft[] }

const KEY = 'voxlace-guest'

export function loadGuest(): GuestSession | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as GuestSession | null
    return v && typeof v.topic === 'string' && Array.isArray(v.drafts) ? v : null
  } catch {
    return null
  }
}

export function saveGuest(session: GuestSession) {
  localStorage.setItem(KEY, JSON.stringify(session))
}

export function clearGuest() {
  localStorage.removeItem(KEY)
}
