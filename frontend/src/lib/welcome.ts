import { useEffect } from 'react'
import { useMe } from '../api/me'
import { useProfile } from '../api/profile'
import { useThreads } from '../api/threads'
import { remember, remembered } from './storage'

/**
 * First run (DESIGN.md §4.5, FR-33): a new account is sent to /welcome once. "New" means no
 * role in the profile and no chats yet, so accounts that already use Voxlace never see it.
 * The answer is kept in this browser, so the check runs only until it's known.
 */
const key = (userId: string) => `voxlace-welcomed:${userId}`

export const markWelcomed = (userId: string) => remember(key(userId), true)

/** 'loading' until known; then whether this user still needs the welcome. */
export function useNeedsWelcome(): boolean | 'loading' {
  const id = useMe().data?.id
  // Private mode can't remember: treat it as welcomed rather than trap anyone in the welcome.
  const check = Boolean(id) && !remembered(key(id ?? ''), false) && storageWorks()
  const profile = useProfile(check)
  const threads = useThreads()
  const known = !check || (profile.isFetched && threads.isFetched)
  const needs =
    check &&
    known &&
    profile.isSuccess &&
    !profile.data.role.trim() &&
    threads.isSuccess &&
    !threads.data.items.length

  useEffect(() => {
    // An account in use: remember it, so this browser doesn't ask the server again.
    if (id && check && known && !needs) markWelcomed(id)
  }, [id, check, known, needs])

  if (!id) return false // AuthGate loads /me before any page, so this is only a test render
  return known ? needs : 'loading'
}

function storageWorks(): boolean {
  try {
    localStorage.setItem('voxlace-probe', '1')
    localStorage.removeItem('voxlace-probe')
    return true
  } catch {
    return false
  }
}
