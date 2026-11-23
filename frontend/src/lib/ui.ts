/**
 * The component recipes (DESIGN.md §6): one place for how buttons, chips and fields look, so
 * a screen never invents its own. Built only from the tokens in index.css. On touch screens
 * every control grows to 44px (index.css), so these sizes are for mouse and keyboard.
 */

/** The one primary action on a screen: a filled pill. */
export const primary =
  'inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-on-primary transition-opacity duration-(--duration) ease-(--ease) hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40'

/** Secondary actions: an outlined pill. */
export const secondary =
  'inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full border border-edge px-4 text-sm transition-colors duration-(--duration) ease-(--ease) hover:bg-sunken disabled:cursor-not-allowed disabled:opacity-50'

/** Low emphasis: text only, a tint on hover. */
export const ghost =
  'inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full px-3 text-sm text-muted transition-colors duration-(--duration) ease-(--ease) hover:bg-sunken hover:text-ink disabled:cursor-not-allowed disabled:opacity-50'

/** A square icon button; always give it an aria-label (and a Tooltip). */
export const iconButton =
  'grid size-10 flex-none place-items-center rounded-full text-muted transition-colors duration-(--duration) ease-(--ease) hover:bg-sunken hover:text-ink disabled:cursor-not-allowed disabled:opacity-40'

/** A choice chip (platforms, quick changes, starters). Pair with aria-pressed when it toggles. */
export const chip =
  'inline-flex min-h-9 items-center gap-1.5 rounded-full border border-line px-3 text-sm transition-colors duration-(--duration) ease-(--ease) hover:bg-sunken disabled:cursor-not-allowed disabled:opacity-50'

/** A chip that is switched on. */
export const chipOn = 'border-primary bg-primary text-on-primary hover:bg-primary'

/** Text inputs and selects. */
export const field =
  'block min-h-10 w-full rounded-control border border-edge bg-surface px-3 text-sm placeholder:text-muted'

/** A bordered panel (one level only: never a panel inside a panel). */
export const panel = 'rounded-panel border border-line bg-surface'
