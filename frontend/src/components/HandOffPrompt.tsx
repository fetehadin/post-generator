import type { HandOff } from '../lib/useHandOff'
import { primary, secondary } from '../lib/ui'
import { cn } from '../lib/utils'

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
        <button type="button" onClick={hand.notYet} className={secondary}>
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
