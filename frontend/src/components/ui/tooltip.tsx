import * as React from 'react'
import { Tooltip as TooltipPrimitive } from 'radix-ui'
import { cn } from '@/lib/utils'

/**
 * The one tooltip (instead of the browser's `title`): rendered in a portal so nothing clips it,
 * it flips near edges, opens on hover and keyboard focus, and floats with a border and no
 * shadow. Use it for icon buttons and shortcut hints; the trigger still needs its own label.
 */
export function Tooltip({
  content,
  children,
  side = 'top',
}: {
  content: React.ReactNode
  children: React.ReactElement
  side?: 'top' | 'bottom' | 'left' | 'right'
}) {
  return (
    <TooltipPrimitive.Provider delayDuration={300}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side={side}
            sideOffset={6}
            collisionPadding={8}
            className={cn(
              'z-50 rounded-control border border-line bg-composer px-2.5 py-1.5 text-xs text-ink',
            )}
          >
            {content}
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  )
}

/** A key hint inside a tooltip: <Kbd>Enter</Kbd>. */
export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="ml-1 rounded border border-line bg-sunken px-1 font-sans text-[0.75rem] text-muted">
      {children}
    </kbd>
  )
}
