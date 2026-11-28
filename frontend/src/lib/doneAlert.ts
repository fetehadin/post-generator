import { useSyncExternalStore } from 'react'

/**
 * "Your drafts are ready" when writing finishes while you look elsewhere (product owner,
 * 28 Nov 2026, like Claude does):
 * - another page in Voxlace: a small notice with Open (useDoneNotice, shown by AppShell);
 * - another tab or app: the tab title says so, and a desktop notification if you allowed it
 *   (askToNotify, from the writing card's "Notify me" button: browsers only ask after a click).
 * Nothing is sent from the server; this lives in the open tab only.
 */

export type DoneNotice = { threadId: string; count: number }

let notice: DoneNotice | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export function useDoneNotice(): DoneNotice | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => notice,
  )
}

export function dismissDone() {
  if (!notice) return
  notice = null
  emit()
}

const READY_TITLE = '✓ Drafts ready · Voxlace'
let savedTitle: string | null = null

/** Put the title back once the tab is looked at again. */
function restoreTitleWhenSeen() {
  const back = () => {
    if (document.visibilityState !== 'visible') return
    if (savedTitle !== null) document.title = savedTitle
    savedTitle = null
    document.removeEventListener('visibilitychange', back)
  }
  document.addEventListener('visibilitychange', back)
}

const supported = () => typeof window !== 'undefined' && 'Notification' in window

/** The "Notify me" button shows only while the browser hasn't been asked yet. */
export function canAskToNotify(): boolean {
  return supported() && Notification.permission === 'default'
}

export function notifyAllowed(): boolean {
  return supported() && Notification.permission === 'granted'
}

export async function askToNotify(): Promise<boolean> {
  if (!supported()) return false
  return (await Notification.requestPermission()) === 'granted'
}

/** Called when a chat's drafts are written (api/threads useGenerateInThread). */
export function announceDrafts(threadId: string, count: number) {
  if (count < 1) return
  const here = window.location.pathname === `/chat/${threadId}`
  const away = document.visibilityState === 'hidden'
  if (!here) {
    notice = { threadId, count }
    emit()
  }
  if (!away) return
  if (savedTitle === null) {
    savedTitle = document.title
    restoreTitleWhenSeen()
  }
  document.title = READY_TITLE
  if (notifyAllowed()) {
    try {
      const n = new Notification('Your drafts are ready', {
        body:
          count === 1 ? 'One draft is ready to review.' : `${count} drafts are ready to review.`,
        tag: `drafts-${threadId}`,
        icon: '/favicon.svg',
      })
      n.onclick = () => {
        window.focus()
        n.close()
      }
    } catch {
      // Some browsers (Android Chrome) only notify from a service worker: the title and the
      // in-app notice still tell the user.
    }
  }
}
