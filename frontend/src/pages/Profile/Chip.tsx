import type { ComponentProps } from 'react'
import { cn } from '../../lib/utils'

/** A pill that is on or off (platforms, reminder days): a real button with aria-pressed. */
export function Chip({ on, className, ...props }: ComponentProps<'button'> & { on: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      className={cn(
        'min-h-10 rounded-full border px-4 text-sm',
        on
          ? 'border-primary bg-primary font-semibold text-on-primary'
          : 'border-line text-muted hover:border-edge hover:text-ink',
        className,
      )}
      {...props}
    />
  )
}
