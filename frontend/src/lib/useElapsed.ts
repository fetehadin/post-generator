import { useEffect, useState } from 'react'

/** Seconds since `active` became true; 0 when inactive. Drives the slow states in DESIGN.md §7. */
export function useElapsed(active: boolean) {
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    if (!active) return
    const started = Date.now()
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000)
    return () => {
      clearInterval(timer)
      setSeconds(0)
    }
  }, [active])
  return seconds
}

/** The line under a placeholder while the AI works (DESIGN.md §7: 3 s, then 20 s). */
export function slowNote(seconds: number): string {
  if (seconds >= 20)
    return 'This is taking longer than usual. Your text is saved; you can leave and come back.'
  if (seconds >= 3) return 'Still working…'
  return ''
}
