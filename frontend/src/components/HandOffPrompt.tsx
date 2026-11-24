import type { HandOff } from '../lib/useHandOff'
import { cn } from '../lib/utils'

const primary =
  'inline-flex min-h-9 items-center rounded-full bg-primary px-3 text-sm font-semibold text-on-primary disabled:opacity-50'
const quiet =
  'inline-flex min-h-9 items-center rounded-full border border-edge px-3 text-sm hover:bg-sunken'

/**
 * After a hand-off (DESIGN.md §4.2): what happened, then "Did you post it?" → Posted.
 * Voxlace can't see the platform, so only the user's yes marks it Posted (GLOSSARY: Posted).
 */
export function HandOffPrompt({ hand, className }: { hand: HandOff; className?: string }) {
  return (
    <div aria-live="polite" className={cn('flex flex-col gap-2 text-sm', className)}>
      {hand.note && <p>{hand.note}</p>}
      {hand.failed && (
        <p role="alert" className="text-danger">
          {hand.failed}
        </p>
      )}
      <p className="font-semibold">Did you post it?</p>
      <div className="flex gap-2">
        <button type="button" disabled={hand.marking} onClick={hand.markPosted} className={primary}>
          Yes, mark as posted
        </button>
        <button type="button" onClick={hand.notYet} className={quiet}>
          Not yet
        </button>
      </div>
      {hand.error && (
        <p role="alert" className="text-danger">
          {hand.error.message}
        </p>
      )}
    </div>
  )
}
