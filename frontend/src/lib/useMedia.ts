import { useSyncExternalStore } from 'react'

/** Whether a media query matches, kept up to date (e.g. the 1280px panel breakpoint). */
export function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (change) => {
      const m = matchMedia(query)
      m.addEventListener('change', change)
      return () => m.removeEventListener('change', change)
    },
    () => matchMedia(query).matches,
  )
}
