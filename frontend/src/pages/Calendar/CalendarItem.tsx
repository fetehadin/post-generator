import { useState, type PointerEvent } from 'react'
import { Link } from 'react-router'
import type { usePatchAnyDraft } from '../../api/drafts'
import { useTelegram } from '../../api/telegram'
import type { DraftRow, Platform } from '../../api/types'
import { HandOffPrompt } from '../../components/HandOffPrompt'
import { Icon } from '../../components/Icon'
import { PlatformMark } from '../../components/PlatformMark'
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/popover'
import { isDue, isMissed } from '../../lib/calendar'
import { LABEL } from '../../lib/platforms'
import { fromLocalInput, toLocalInput } from '../../lib/time'
import { useHandOff } from '../../lib/useHandOff'
import { cn } from '../../lib/utils'

const timeFormat = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

export type ItemState = 'planned' | 'due' | 'missed' | 'posted'

/** Where a post on the calendar stands now. A post the bot couldn't send is missed at once. */
export function itemState(d: DraftRow, now: Date): ItemState {
  if (d.status === 'published') return 'posted'
  if (d.bot_error || isMissed(d.scheduled_for!, now)) return 'missed'
  return isDue(d.scheduled_for!, now) ? 'due' : 'planned'
}

/** Each card's left edge, in its platform's own colour (DESIGN.md §4.3). */
const EDGE: Record<Platform, string> = {
  x: 'border-l-ink',
  linkedin: 'border-l-linkedin',
  telegram: 'border-l-telegram',
}

/** True when the Telegram bot posts this one by itself at its time (ADR 0001). */
export function useBotSends(draft: DraftRow): boolean {
  const telegram = draft.platform === 'telegram'
  return telegram && Boolean(useTelegram(false, telegram).data?.channel?.can_post)
}

/** The post's state in words and an icon, never colour alone (WCAG 1.4.1). */
export function StatusTag({
  state,
  bot,
  short = false,
}: {
  state: ItemState
  bot: boolean
  /** The grid's narrow cards say "Due" (the card is already at its time). */
  short?: boolean
}) {
  if (state === 'planned' && !bot) return null
  const [icon, text, tone] =
    state === 'due'
      ? (['clock', short ? 'Due' : 'Due now', 'text-signal'] as const)
      : state === 'missed'
        ? (['alert', 'Missed', 'text-danger'] as const)
        : state === 'posted'
          ? (['check', 'Posted', 'text-muted'] as const)
          : (['refresh', 'Bot sends', 'text-muted'] as const)
  return (
    <span
      className={cn('inline-flex min-w-0 items-center gap-1 font-semibold whitespace-nowrap', tone)}
    >
      <Icon name={icon} className="size-3.5" />
      {text}
    </span>
  )
}

type Props = {
  draft: DraftRow
  state: ItemState
  patch: ReturnType<typeof usePatchAnyDraft>
  /** From useMoveDrag: starts a drag with the mouse anywhere, with touch from the grip. */
  drag?: { onPointerDown: (e: PointerEvent<HTMLElement>) => void }
  dragging?: boolean
}

/**
 * One post on the calendar (DESIGN.md §4.3): a small card with its platform's logo and colour,
 * the time, two lines of text and its state. Click it for the whole text and what you can do;
 * drag it (mouse anywhere, touch from the grip) to another day or row.
 */
export function CalendarItem({ draft, state, patch, drag, dragging = false }: Props) {
  const [open, setOpen] = useState(false)
  const bot = useBotSends(draft)
  const time = timeFormat.format(new Date(draft.scheduled_for!))
  const text = draft.text.trim()
  const firstLine = text.split('\n').find((l) => l.trim()) ?? ''
  const status =
    state === 'planned' ? (bot ? ', bot sends' : '') : `, ${state === 'due' ? 'due now' : state}`
  const label = `${LABEL[draft.platform]} at ${time}${status}: ${firstLine}`

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div
        {...drag}
        className={cn(
          'group relative w-full min-w-0 touch-pan-y overflow-hidden rounded-control border border-l-[3px] bg-surface text-xs transition-[border-color,box-shadow,opacity] duration-(--duration) ease-(--ease) select-none hover:shadow-float',
          EDGE[draft.platform],
          state === 'missed'
            ? 'border-y-danger border-r-danger'
            : state === 'due'
              ? 'border-y-signal border-r-signal'
              : 'border-y-line border-r-line',
          state === 'posted' && 'opacity-60 hover:opacity-100',
          drag && 'cursor-grab active:cursor-grabbing',
          dragging && 'z-20 shadow-float',
        )}
      >
        {drag && (
          <span
            data-grip
            aria-hidden="true"
            className="absolute top-1 right-1 grid size-5 touch-none place-items-center rounded text-muted opacity-40 group-hover:opacity-100"
          >
            <Icon name="grip" className="size-3.5" />
          </span>
        )}
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={label}
            className="flex w-full min-w-0 flex-col gap-1 px-2 py-1.5 text-left"
          >
            <span className="flex items-center gap-1.5 pr-4">
              <PlatformMark platform={draft.platform} className="size-4" />
              <span className="font-semibold tabular-nums">{time}</span>
            </span>
            <span className="line-clamp-2 leading-snug break-words text-muted">{text}</span>
            <StatusTag state={state} bot={bot} short />
          </button>
        </PopoverTrigger>
      </div>
      <PopoverContent align="start" className="w-80">
        <ItemDetails draft={draft} state={state} patch={patch} onDone={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  )
}

/**
 * Today's view: one post in full, with its actions in view (no click needed to find them).
 */
export function TodayCard({
  draft,
  state,
  patch,
}: {
  draft: DraftRow
  state: ItemState
  patch: ReturnType<typeof usePatchAnyDraft>
}) {
  return (
    <article
      className={cn(
        'rounded-panel border border-l-4 bg-surface p-4',
        EDGE[draft.platform],
        state === 'missed'
          ? 'border-y-danger border-r-danger'
          : state === 'due'
            ? 'border-y-signal border-r-signal'
            : 'border-y-line border-r-line',
        state === 'posted' && 'opacity-60',
      )}
    >
      <ItemDetails draft={draft} state={state} patch={patch} full />
    </article>
  )
}

/**
 * A post's text and actions: Post now once it's due or missed (Post to Telegram now when the
 * bot posts it), Change time (no dragging needed, WCAG 2.5.7), Edit (its chat), Back to drafts
 * (off the calendar, not approved any more) and Posted. A posted post only opens its chat.
 */
export function ItemDetails({
  draft,
  state,
  patch,
  onDone,
  full = false,
  startMoving = false,
}: {
  draft: DraftRow
  state: ItemState
  patch: ReturnType<typeof usePatchAnyDraft>
  onDone?: () => void
  full?: boolean
  /** Open straight on the time picker (the "Needs you" strip's Change time). */
  startMoving?: boolean
}) {
  const hand = useHandOff(draft)
  const bot = useBotSends(draft)
  const [mode, setMode] = useState<'view' | 'move'>(startMoving ? 'move' : 'view')
  const [when, setWhen] = useState(() => toLocalInput(draft.scheduled_for!))
  const time = timeFormat.format(new Date(draft.scheduled_for!))
  const error = patch.error
  const quiet =
    'inline-flex min-h-9 items-center rounded-full border border-edge px-3 text-sm hover:bg-sunken disabled:opacity-50'

  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="flex flex-wrap items-center gap-2">
        <PlatformMark platform={draft.platform} />
        <span className="font-semibold">
          {LABEL[draft.platform]} · <span className="tabular-nums">{time}</span>
        </span>
        <span className="ml-auto text-xs">
          <StatusTag state={state} bot={bot} />
        </span>
      </p>
      <p className={cn('leading-writing whitespace-pre-line', !full && 'line-clamp-6')}>
        {draft.text}
      </p>
      {draft.bot_error && state === 'missed' && <p className="text-danger">{draft.bot_error}</p>}

      {mode === 'move' && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            patch.mutate(
              { id: draft.id, scheduled_for: fromLocalInput(when) },
              {
                onSuccess: () => {
                  setMode('view')
                  onDone?.()
                },
              },
            )
          }}
        >
          <label className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-xs text-muted">New time (your time)</span>
            <input
              type="datetime-local"
              min={toLocalInput(new Date().toISOString())}
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              className="min-h-9 rounded-control border border-edge bg-surface px-2"
            />
          </label>
          <button
            type="submit"
            disabled={patch.isPending}
            className="min-h-9 rounded-full bg-primary px-3 font-semibold text-on-primary"
          >
            Move
          </button>
        </form>
      )}

      {hand.asked ? (
        <HandOffPrompt hand={hand} />
      ) : (
        <>
          {hand.failed && (
            <p role="alert" className="text-danger">
              {hand.failed}
            </p>
          )}
          {hand.note && <p className="text-muted">{hand.note}</p>}
          <div className="flex flex-wrap gap-2">
            {(state === 'due' || state === 'missed') && (
              <button
                type="button"
                disabled={hand.posting}
                onClick={() => void hand.post()}
                title={hand.detail}
                className="min-h-9 rounded-full bg-primary px-3 font-semibold text-on-primary"
              >
                {hand.posting ? 'Posting…' : hand.label}
              </button>
            )}
            {state !== 'posted' && mode !== 'move' && (
              <button type="button" onClick={() => setMode('move')} className={quiet}>
                Change time
              </button>
            )}
            <Link to={`/drafts/${draft.id}`} className={quiet}>
              Edit
            </Link>
            {state !== 'posted' && (
              <>
                <button
                  type="button"
                  disabled={patch.isPending}
                  onClick={() =>
                    patch.mutate({ id: draft.id, status: 'draft' }, { onSuccess: () => onDone?.() })
                  }
                  className={quiet}
                >
                  Back to drafts
                </button>
                <button
                  type="button"
                  disabled={patch.isPending}
                  onClick={() => patch.mutate({ id: draft.id, status: 'published' })}
                  className={cn(quiet, 'ml-auto')}
                >
                  Posted
                </button>
              </>
            )}
          </div>
        </>
      )}
      {error && (
        <p role="alert" className="text-danger">
          {error.message}
        </p>
      )}
    </div>
  )
}
