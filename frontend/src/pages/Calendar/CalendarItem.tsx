import { useState, type PointerEvent } from 'react'
import { Link } from 'react-router'
import type { usePatchAnyDraft } from '../../api/drafts'
import type { DraftRow } from '../../api/types'
import { Icon } from '../../components/Icon'
import { PlatformMark } from '../../components/PlatformMark'
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/popover'
import { cn } from '../../lib/utils'
import { LABEL } from '../../lib/platforms'
import { fromLocalInput, toLocalInput } from '../../lib/time'
import { HandOffPrompt } from '../../components/HandOffPrompt'
import { useHandOff } from '../../lib/useHandOff'

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })

export type ItemState = 'planned' | 'due' | 'missed'

type Props = {
  draft: DraftRow
  state: ItemState
  patch: ReturnType<typeof usePatchAnyDraft>
  /** From useMoveDrag: starts a drag with the mouse anywhere, with touch from the grip. */
  drag?: { onPointerDown: (e: PointerEvent<HTMLElement>) => void }
  dragging?: boolean
}

/**
 * One scheduled post (DESIGN.md §4.3): a quiet chip in the grid. Click it for the text and
 * what you can do: Edit (its chat), Change time (no dragging needed, WCAG 2.5.7), and once it's
 * due or missed, Post now (copy and open) then Posted. A missed post is red and can go to
 * another day, where the app picks the hour again (FR-45).
 */
export function CalendarItem({ draft, state, patch, drag, dragging = false }: Props) {
  const [open, setOpen] = useState(false)
  const time = timeFormat.format(new Date(draft.scheduled_for!))
  const firstLine = draft.text.split('\n').find((l) => l.trim()) ?? ''
  const name = LABEL[draft.platform]
  const label = `${name} at ${time}${state === 'missed' ? ', missed' : state === 'due' ? ', due now' : ''}: ${firstLine}`

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div
        {...drag}
        className={cn(
          'group flex min-h-7 min-w-0 flex-1 touch-pan-y items-stretch rounded-control border bg-surface text-xs transition-[border-color,box-shadow] duration-(--duration) ease-(--ease) select-none',
          state === 'missed'
            ? 'border-danger'
            : state === 'due'
              ? 'border-signal'
              : 'border-line hover:border-edge',
          drag && 'cursor-grab active:cursor-grabbing',
          dragging && 'relative z-20 shadow-float',
        )}
      >
        <span
          data-grip
          aria-hidden="true"
          className="grid w-4 flex-none touch-none place-items-center text-muted opacity-60 group-hover:opacity-100"
        >
          <Icon name="grip" className="size-3.5" />
        </span>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={label}
            className="flex min-w-0 flex-1 items-center gap-1.5 py-1.5 pr-2 text-left"
          >
            <PlatformMark platform={draft.platform} />
            {state !== 'planned' && (
              <Icon
                name={state === 'missed' ? 'alert' : 'clock'}
                className={cn(
                  'size-3.5 flex-none',
                  state === 'missed' ? 'text-danger' : 'text-signal',
                )}
              />
            )}
            <span
              className={cn(
                'font-semibold whitespace-nowrap tabular-nums',
                state === 'missed' && 'text-danger',
                state === 'due' && 'text-signal',
              )}
            >
              {time}
            </span>
            <span className="min-w-0 truncate text-muted">{firstLine}</span>
          </button>
        </PopoverTrigger>
      </div>
      <PopoverContent align="start" className="w-80">
        <ItemDetails
          draft={draft}
          state={state}
          time={time}
          patch={patch}
          onDone={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  )
}

function ItemDetails({
  draft,
  state,
  time,
  patch,
  onDone,
}: {
  draft: DraftRow
  state: ItemState
  time: string
  patch: ReturnType<typeof usePatchAnyDraft>
  onDone: () => void
}) {
  const hand = useHandOff(draft)
  const [mode, setMode] = useState<'view' | 'move'>('view')
  const [when, setWhen] = useState(() => toLocalInput(draft.scheduled_for!))
  const error = patch.error
  const quiet =
    'min-h-9 rounded-full border border-edge px-3 text-sm hover:bg-sunken disabled:opacity-50'

  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="flex items-center gap-2">
        <PlatformMark platform={draft.platform} />
        <span className="font-semibold">
          {LABEL[draft.platform]} · {time}
        </span>
        {state !== 'planned' && (
          <span className={cn('ml-auto', state === 'missed' ? 'text-danger' : 'text-signal')}>
            {state === 'missed' ? 'Missed' : 'Due now'}
          </span>
        )}
      </p>
      <p className="line-clamp-5 leading-writing whitespace-pre-line">{draft.text}</p>

      {mode === 'move' && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            patch.mutate(
              { id: draft.id, scheduled_for: fromLocalInput(when) },
              { onSuccess: onDone },
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
          <div className="flex flex-wrap gap-2">
            {state !== 'planned' && (
              <button
                type="button"
                onClick={() => void hand.post()}
                className="min-h-9 rounded-full bg-primary px-3 font-semibold text-on-primary"
              >
                {hand.label}
              </button>
            )}
            <Link to={`/drafts/${draft.id}`} className={cn(quiet, 'inline-flex items-center')}>
              Edit
            </Link>
            {mode !== 'move' && (
              <button type="button" onClick={() => setMode('move')} className={quiet}>
                Change time
              </button>
            )}
            <button
              type="button"
              disabled={patch.isPending}
              onClick={() => patch.mutate({ id: draft.id, status: 'published' })}
              className={cn(quiet, 'ml-auto')}
            >
              Posted
            </button>
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
