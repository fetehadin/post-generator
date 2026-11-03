import { useMe } from '../api/me'
import { useProfile } from '../api/profile'

/**
 * First run (DESIGN.md §4.5, FR-33): a new account is sent to /welcome once. "New" means the
 * profile has no role yet; finishing or skipping the welcome is remembered in this browser,
 * so the profile is only fetched for this check until then.
 */
const key = (userId: string) => `voxlace-welcomed:${userId}`

function remembered(userId: string): boolean {
  try {
    return localStorage.getItem(key(userId)) === '1'
  } catch {
    return true // private mode: never trap anyone in the welcome
  }
}

export function markWelcomed(userId: string) {
  try {
    localStorage.setItem(key(userId), '1')
  } catch {
    // Private mode: the role saved in the welcome is enough to skip it next time.
  }
}

/** True once we know this user still needs the welcome; false while loading. */
export function useNeedsWelcome(): boolean {
  const id = useMe().data?.id
  const check = Boolean(id) && !remembered(id!)
  const profile = useProfile(check)
  return check && profile.isSuccess && !profile.data.role.trim()
}
