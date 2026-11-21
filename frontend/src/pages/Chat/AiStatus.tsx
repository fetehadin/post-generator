import { useEffect, useState } from 'react'
import type { Platform } from '../../api/types'
import { Icon } from '../../components/Icon'
import { PlatformMark } from '../../components/PlatformMark'
import { copyText } from '../../lib/handoff'
import { LABEL } from '../../lib/platforms'
import { ghost, secondary } from '../../lib/ui'
import { useElapsed } from '../../lib/useElapsed'
import { cn } from '../../lib/utils'

/**
 * The AI's states (DESIGN.md §7). The API answers with a finished draft, not a stream, so the
 * wait names what is happening step by step, never as an endless spinner, and the text then
 * arrives with a short reveal. Every state keeps the user's text and offers a way on.
 */

type Step = [after: number, label: string]

const WRITING: Step[] = [
  [0, 'Reading your check-in'],
  [2, 'Finding examples in your posts'],
  [5, 'Writing your {p} draft'],
  [12, 'Checking the length and the facts'],
]
const REVISING: Step[] = [
  [0, 'Reading your note'],
  [2, 'Rewriting your {p} draft'],
  [10, 'Checking the length and the facts'],
]

function stepAt(steps: Step[], seconds: number, platform: Platform) {
  const label = [...steps].reverse().find(([after]) => seconds >= after)?.[1] ?? steps[0][1]
  return label.replace('{p}', LABEL[platform])
}

/** A draft being written: the same frame as a draft card, so nothing jumps when it lands. */
export function WritingCard({
  platform,
  revising = false,
  onStop,
}: {
  platform: Platform
  revising?: boolean
  onStop?: () => void
}) {
  const seconds = useElapsed(true)
  const step = stepAt(revising ? REVISING : WRITING, seconds, platform)
  return (
    <div
      aria-busy="true"
      className="rounded-panel border border-line bg-surface p-5"
      data-testid={`writing-${platform}`}
    >
      <div className="flex items-center gap-2 text-sm">
        <PlatformMark platform={platform} />
        <span className="font-semibold">{LABEL[platform]} draft</span>
        {onStop && (
          <button type="button" onClick={onStop} className={cn(ghost, 'ml-auto min-h-9')}>
            <Icon name="stop" className="size-3.5 fill-current" />
            Stop
          </button>
        )}
      </div>
      {/* Polite and named: screen readers hear each step once, not a ticking timer. */}
      <p aria-live="polite" className="mt-4 flex items-center gap-2 text-sm text-muted">
        <Icon name="nib" className="size-4 animate-pulse text-thread" />
        {step}…
      </p>
      <div aria-hidden="true" className="mt-4 flex flex-col gap-3">
        {['w-11/12', 'w-full', 'w-3/4'].map((w) => (
          <span key={w} className={cn('h-3 rounded-full bg-sunken', w)} />
        ))}
      </div>
      {seconds >= 20 && (
        <p className="mt-4 text-sm text-muted">
          This is taking longer than usual. Your text is saved; you can leave and come back.
        </p>
      )}
    </div>
  )
}

/**
 * The finished text arriving word by word, once, in about half a second: the API sends the
 * whole draft, this only paces how it appears. Off with reduced motion or for old cards.
 */
export function useReveal(text: string, enabled: boolean) {
  const reduced =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  const words = text.split(/(\s+)/)
  const [shown, setShown] = useState(enabled && !reduced ? 0 : words.length)
  useEffect(() => {
    if (!enabled || reduced) return
    const started = performance.now()
    const total = Math.min(900, 250 + words.length * 12)
    let frame = 0
    const tick = (now: number) => {
      const done = Math.min(1, (now - started) / total)
      setShown(Math.ceil(done * words.length))
      if (done < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
    // Once per card: a new text means a new card (keyed by version).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return { text: words.slice(0, shown).join(''), done: shown >= words.length }
}

/**
 * The AI service is down or busy: the user can still post today by hand. Copies the
 * check-in so they can paste and edit it on the platform themselves.
 */
export function ManualFallback({ checkin }: { checkin: string }) {
  const [copied, setCopied] = useState<boolean | null>(null)
  return (
    <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
      Or write it yourself today:
      <button
        type="button"
        onClick={async () => setCopied(await copyText(checkin))}
        className={cn(secondary, 'min-h-9')}
      >
        <Icon name="copy" className="size-4" />
        {copied ? 'Copied your check-in' : 'Copy your check-in'}
      </button>
      {copied === false && <span>Couldn't copy: select the text and copy it by hand.</span>}
    </p>
  )
}
