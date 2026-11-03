import { useEffect, useRef } from 'react'
import type { usePatchAnyDraft } from '../../api/drafts'
import type { DraftRow } from '../../api/types'
import { dayKey, isDue, isMissed, sameDay } from '../../lib/calendar'
import type { useMoveDrag } from '../../lib/useMoveDrag'
import { Icon } from '../../components/Icon'
import { cn } from '../../lib/utils'
import { CalendarItem, type ItemState } from './CalendarItem'

export const ROW = 56 // px per hour in the time grids
const OPEN_AT = 7 // the time grids open scrolled to 07:00 (DESIGN.md §4.3)
const MONTH_CHIPS = 3 // more than this in a month cell becomes "+N more"
const HOURS = Array.from({ length: 24 }, (_, h) => h)
const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'short' })
const dayName = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
})
const hourLabel = (h: number) =>
  new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).format(new Date(2000, 0, 1, h))

type Shared = {
  items: DraftRow[]
  now: Date
  patch: ReturnType<typeof usePatchAnyDraft>
  move: ReturnType<typeof useMoveDrag>
}

export function itemState(d: DraftRow, now: Date): ItemState {
  if (isMissed(d.scheduled_for!, now)) return 'missed'
  return isDue(d.scheduled_for!, now) ? 'due' : 'planned'
}

function postsAt(items: DraftRow[], day: Date, hour?: number) {
  return items
    .filter((d) => {
      const t = new Date(d.scheduled_for!)
      return sameDay(t, day) && (hour === undefined || t.getHours() === hour)
    })
    .sort((a, b) => a.scheduled_for!.localeCompare(b.scheduled_for!))
}

function Item({ d, now, patch, move }: Shared & { d: DraftRow }) {
  return (
    <CalendarItem
      draft={d}
      state={itemState(d, now)}
      patch={patch}
      drag={move.handle(d.id)}
      dragging={move.dragging === d.id}
    />
  )
}

/**
 * Week (columns are days) and day (one column): rows are hours. Posts in the same hour sit
 * side by side. The selected platform's best hours are shaded with a bar on the left (FR-16),
 * and a thin line marks now in today's column.
 */
export function TimeGrid({
  days,
  best,
  bestFor,
  ...shared
}: Shared & { days: Date[]; best: Record<string, number[]>; bestFor: string | null }) {
  const scroller = useRef<HTMLDivElement>(null)
  useEffect(() => {
    // A little above 07:00, so its label (drawn over the line) isn't cut off.
    if (scroller.current) scroller.current.scrollTop = ROW * OPEN_AT - 12
  }, [])
  const { now, move } = shared
  const cols =
    days.length === 1
      ? 'grid-cols-[64px_minmax(0,1fr)]'
      : 'grid-cols-[64px_repeat(7,minmax(0,1fr))]'

  return (
    <div className="overflow-hidden rounded-panel border border-line bg-surface">
      <div className={cn('grid border-b border-line', cols)}>
        <span />
        {days.map((day) => (
          <div
            key={day.toISOString()}
            className={cn(
              'border-l border-line px-2 py-2 text-center text-sm',
              sameDay(day, now) ? 'font-semibold text-ink' : 'text-muted',
            )}
          >
            {weekday.format(day)}{' '}
            <span
              className={cn(
                'tabular-nums',
                sameDay(day, now) && 'rounded-full bg-primary px-1.5 py-0.5 text-on-primary',
              )}
            >
              {day.getDate()}
            </span>
          </div>
        ))}
      </div>
      <div ref={scroller} className="max-h-[68vh] overflow-y-auto overscroll-contain">
        {HOURS.map((h) => (
          <div key={h} className={cn('grid', cols)} style={{ minHeight: ROW }}>
            <span className="-mt-2 pr-2 text-right text-xs text-muted tabular-nums">
              {h > 0 && hourLabel(h)}
            </span>
            {days.map((day) => {
              const key = dayKey(day)
              const isBest = best[key]?.includes(h)
              const here = postsAt(shared.items, day, h)
              const nowHere = sameDay(day, now) && now.getHours() === h
              return (
                <div
                  key={key}
                  data-drop-day={key}
                  data-drop-hour={h}
                  title={isBest && bestFor ? `A best hour for your ${bestFor} audience` : undefined}
                  className={cn(
                    'relative flex flex-wrap content-start gap-1 border-t border-l border-line p-1 transition-colors duration-(--duration) ease-(--ease)',
                    isBest &&
                      'bg-sunken before:absolute before:inset-y-1 before:left-1 before:w-0.5 before:rounded-full before:bg-edge',
                    move.over === `${key}@${h}` && 'bg-sunken ring-1 ring-edge ring-inset',
                  )}
                >
                  {isBest && <span className="sr-only">Best hour for {bestFor}.</span>}
                  {nowHere && (
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-x-0 z-10 h-px bg-ink"
                      style={{ top: `${(now.getMinutes() / 60) * 100}%` }}
                    />
                  )}
                  {here.map((d) => (
                    <Item key={d.id} d={d} {...shared} />
                  ))}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

/** Month: rows are weeks, columns are days; each post is a chip with its time. */
export function MonthGrid({
  weeks,
  month,
  onOpenDay,
  ...shared
}: Shared & { weeks: Date[][]; month: number; onOpenDay: (day: Date) => void }) {
  const { now, move } = shared
  return (
    <div className="overflow-hidden rounded-panel border border-line bg-surface">
      <div className="grid grid-cols-7 border-b border-line text-center text-sm text-muted">
        {weeks[0].map((d) => (
          <span key={d.toISOString()} className="py-2">
            {weekday.format(d)}
          </span>
        ))}
      </div>
      {weeks.map((week) => (
        <div key={week[0].toISOString()} className="grid grid-cols-7">
          {week.map((day) => {
            const key = dayKey(day)
            const here = postsAt(shared.items, day)
            const extra = here.length - MONTH_CHIPS
            return (
              <div
                key={key}
                data-drop-day={key}
                className={cn(
                  'flex min-h-16 min-w-0 flex-col gap-1 border-t border-l border-line p-1 transition-colors duration-(--duration) ease-(--ease) md:min-h-28',
                  day.getMonth() !== month && 'bg-sunken/60',
                  move.over === key && 'bg-sunken ring-1 ring-edge ring-inset',
                )}
              >
                <button
                  type="button"
                  onClick={() => onOpenDay(day)}
                  aria-label={`Open ${day.toDateString()}`}
                  className={cn(
                    'grid min-h-6 min-w-6 place-items-center self-start rounded-full px-1 text-xs tabular-nums hover:bg-sunken',
                    sameDay(day, now) ? 'bg-primary font-semibold text-on-primary' : 'text-muted',
                  )}
                >
                  {day.getDate()}
                </button>
                <div className="hidden flex-col gap-1 md:flex">
                  {here.slice(0, MONTH_CHIPS).map((d) => (
                    <Item key={d.id} d={d} {...shared} />
                  ))}
                  {extra > 0 && (
                    <button
                      type="button"
                      onClick={() => onOpenDay(day)}
                      className="self-start rounded-control px-1 text-xs text-muted hover:bg-sunken hover:text-ink"
                    >
                      +{extra} more
                    </button>
                  )}
                </div>
                {/* Phones: too narrow for chips. A mark per post (an icon when missed or due, so
                    the state isn't colour alone), and the day opens on tap. */}
                {here.length > 0 && (
                  <button
                    type="button"
                    onClick={() => onOpenDay(day)}
                    aria-label={dotsLabel(day, here, now)}
                    className="flex min-h-6 w-full flex-wrap items-center gap-0.5 rounded-control px-0.5 hover:bg-sunken md:hidden"
                  >
                    {here.map((d) => {
                      const state = itemState(d, now)
                      return state === 'planned' ? (
                        <span key={d.id} className="size-1.5 rounded-full bg-ink" />
                      ) : (
                        <Icon
                          key={d.id}
                          name={state === 'missed' ? 'alert' : 'clock'}
                          className={cn(
                            'size-3',
                            state === 'missed' ? 'text-danger' : 'text-signal',
                          )}
                        />
                      )
                    })}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

/** "Tue, 4 Nov: 2 posts, 1 missed", for the phone month cell's button. */
function dotsLabel(day: Date, here: DraftRow[], now: Date) {
  const states = here.map((d) => itemState(d, now))
  const missed = states.filter((s) => s === 'missed').length
  const due = states.filter((s) => s === 'due').length
  return [
    `${dayName.format(day)}: ${here.length} ${here.length === 1 ? 'post' : 'posts'}`,
    missed && `${missed} missed`,
    due && `${due} due now`,
  ]
    .filter(Boolean)
    .join(', ')
}

/** Phones, week view: one list per day; the same chips, menus and Move to…. */
export function WeekList({ days, ...shared }: Shared & { days: Date[] }) {
  return (
    <ol className="flex flex-col gap-4">
      {days.map((day) => {
        const here = postsAt(shared.items, day)
        return (
          <li key={day.toISOString()}>
            <h3
              className={cn(
                'text-sm',
                sameDay(day, shared.now) ? 'font-semibold text-ink' : 'text-muted',
              )}
            >
              {weekday.format(day)} {day.getDate()}
            </h3>
            <div className="mt-1 flex flex-col gap-1">
              {here.map((d) => (
                <Item key={d.id} d={d} {...shared} />
              ))}
              {!here.length && <p className="text-xs text-muted">Nothing planned.</p>}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
