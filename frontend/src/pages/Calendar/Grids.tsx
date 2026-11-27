import { useEffect, useMemo, useRef } from 'react'
import type { usePatchAnyDraft } from '../../api/drafts'
import type { DraftRow } from '../../api/types'
import { SLOT_HOURS, SLOTS, dayKey, sameDay, slotOf } from '../../lib/calendar'
import type { useMoveDrag } from '../../lib/useMoveDrag'
import { cn } from '../../lib/utils'
import { CalendarItem, TodayCard, itemState } from './CalendarItem'

const OPEN_AT = 6 // the week grid opens on the 06:00 row (DESIGN.md §4.3)
const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'short' })
/** 24-hour like every other time in the app (lib/time.ts): "06:00", never "6 AM". */
const hourFormat = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})
const SLOT_LABELS = SLOTS.map((h) => hourFormat.format(new Date(2000, 0, 1, h)))

type Shared = {
  items: DraftRow[]
  now: Date
  patch: ReturnType<typeof usePatchAnyDraft>
  move: ReturnType<typeof useMoveDrag>
}

/**
 * The posts of each day ("2026-10-22") and each row ("2026-10-22@18"), sorted by time:
 * grouped once per render, so a cell looks its posts up instead of scanning every post.
 */
function byDayAndSlot(items: DraftRow[]): Map<string, DraftRow[]> {
  const groups = new Map<string, DraftRow[]>()
  const add = (key: string, d: DraftRow) => {
    const list = groups.get(key)
    if (list) list.push(d)
    else groups.set(key, [d])
  }
  const sorted = [...items].sort((a, b) => a.scheduled_for!.localeCompare(b.scheduled_for!))
  for (const d of sorted) {
    const t = new Date(d.scheduled_for!)
    add(dayKey(t), d)
    add(`${dayKey(t)}@${slotOf(t.getHours())}`, d)
  }
  return groups
}
const NONE: DraftRow[] = []

/** Posted posts stay where they went out, faded, and don't move. */
function Item({ d, now, patch, move, canDrag }: Shared & { d: DraftRow; canDrag: boolean }) {
  const state = itemState(d, now)
  const movable = canDrag && state !== 'posted'
  return (
    <CalendarItem
      draft={d}
      state={state}
      patch={patch}
      drag={movable ? move.handle(d.id) : undefined}
      dragging={move.dragging === d.id}
    />
  )
}

/**
 * The week on a computer: seven day columns, twelve two-hour rows. Posts in the same cell stack
 * in time order. Today's column is tinted and a line marks now. Drop a post on another day or
 * row to move it (lib/calendar dropTime).
 */
export function WeekGrid({ days, ...shared }: Shared & { days: Date[] }) {
  const scroller = useRef<HTMLDivElement>(null)
  const firstRow = useRef<HTMLDivElement>(null)
  useEffect(() => {
    // Open on the 06:00 row; the night rows are a short scroll up.
    const row = firstRow.current
    if (scroller.current && row)
      scroller.current.scrollTo?.({ top: row.offsetTop, behavior: 'instant' })
  }, [])
  const { now, move } = shared
  const posts = useMemo(() => byDayAndSlot(shared.items), [shared.items])
  const cols = 'grid-cols-[56px_repeat(7,minmax(0,1fr))]'

  return (
    <div className="overflow-hidden rounded-panel border border-line bg-surface">
      <div className={cn('grid border-b border-line', cols)}>
        <span />
        {days.map((day) => {
          const today = sameDay(day, now)
          return (
            <div
              key={day.toISOString()}
              className={cn(
                'flex items-baseline justify-center gap-1.5 border-l border-line px-2 py-2.5 text-sm',
                today ? 'bg-sunken/60 font-semibold text-ink' : 'text-muted',
              )}
            >
              {weekday.format(day)}
              <span
                className={cn(
                  'grid min-w-6 place-items-center rounded-full px-1 tabular-nums',
                  today && 'bg-primary text-on-primary',
                )}
              >
                {day.getDate()}
              </span>
            </div>
          )
        })}
      </div>
      <div ref={scroller} className="relative max-h-[70vh] overflow-y-auto overscroll-contain">
        {SLOTS.map((h, i) => (
          <div
            key={h}
            ref={h === OPEN_AT ? firstRow : undefined}
            className={cn('grid min-h-20', cols, i > 0 && 'border-t border-line')}
          >
            <span className="pt-1.5 pr-2 text-right text-xs text-muted tabular-nums">
              {SLOT_LABELS[i]}
            </span>
            {days.map((day) => {
              const key = dayKey(day)
              const here = posts.get(`${key}@${h}`) ?? NONE
              const today = sameDay(day, now)
              const nowHere = today && slotOf(now.getHours()) === h
              const minutes = (now.getHours() - h) * 60 + now.getMinutes()
              return (
                <div
                  key={key}
                  data-drop-day={key}
                  data-drop-hour={h}
                  className={cn(
                    'relative flex min-w-0 flex-col gap-1 border-l border-line p-1 transition-colors duration-(--duration) ease-(--ease)',
                    today && 'bg-sunken/40',
                    move.over === `${key}@${h}` && 'bg-sunken ring-2 ring-edge ring-inset',
                  )}
                >
                  {nowHere && (
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-x-0 z-10 h-0.5 bg-danger before:absolute before:-top-[3px] before:-left-1 before:size-2 before:rounded-full before:bg-danger"
                      style={{ top: `${(minutes / (SLOT_HOURS * 60)) * 100}%` }}
                    />
                  )}
                  {here.map((d) => (
                    <Item key={d.id} d={d} canDrag {...shared} />
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

/** Today: its posts in time order, each in full with its actions in view. */
export function TodayList({ day, ...shared }: Shared & { day: Date }) {
  const posts = useMemo(() => byDayAndSlot(shared.items), [shared.items])
  const here = posts.get(dayKey(day)) ?? NONE
  if (!here.length) return null
  return (
    <ol className="flex flex-col gap-3">
      {here.map((d) => (
        <li key={d.id}>
          <TodayCard draft={d} state={itemState(d, shared.now)} patch={shared.patch} />
        </li>
      ))}
    </ol>
  )
}

/**
 * The week on a phone: a list by day. No dragging here (too fiddly in a list): a post's
 * Change time moves it. Days without posts are left out, so the list stays short.
 */
export function WeekList({ days, ...shared }: Shared & { days: Date[] }) {
  const posts = useMemo(() => byDayAndSlot(shared.items), [shared.items])
  return (
    <ol className="flex flex-col gap-5">
      {days.map((day) => {
        const here = posts.get(dayKey(day)) ?? NONE
        if (!here.length) return null
        const today = sameDay(day, shared.now)
        return (
          <li key={dayKey(day)}>
            <h3
              className={cn(
                'text-xs font-semibold tracking-wide uppercase',
                today ? 'text-ink' : 'text-muted',
              )}
            >
              {weekday.format(day)} {day.getDate()}
              {today && ' · today'}
            </h3>
            <div className="mt-2 flex flex-col gap-2">
              {here.map((d) => (
                <Item key={d.id} d={d} canDrag={false} {...shared} />
              ))}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
