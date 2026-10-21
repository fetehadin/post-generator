import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { useDrafts, usePatchAnyDraft } from '../../api/drafts'
import type { DraftRow } from '../../api/types'
import { addDays, monthWeeks, moveTo, sameDay, startOfWeek, weekDays } from '../../lib/calendar'
import { formatWhen } from '../../lib/time'
import { CalendarItem } from './CalendarItem'

const HOURS = Array.from({ length: 24 }, (_, h) => h)
const ROW = 56 // px per hour in the week grid
const dayName = new Intl.DateTimeFormat(undefined, { weekday: 'short' })
const monthName = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' })
const rangeDay = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' })
const hourLabel = (h: number) =>
  new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(
    new Date(2000, 0, 1, h),
  )

/**
 * Calendar (DESIGN.md §4.3, the owner's Google Calendar-style grid): approved posts by day and
 * hour in your own time. Drag to change the day and time, or use "Move to…". "Posted" clears it.
 */
export function CalendarPage() {
  const [view, setView] = useState<'week' | 'month'>('week')
  const [cursor, setCursor] = useState(() => new Date())
  const [now] = useState(() => new Date())
  const patch = usePatchAnyDraft()

  const weeks = view === 'week' ? [weekDays(startOfWeek(cursor))] : monthWeeks(cursor)
  const from = weeks[0][0]
  const to = addDays(weeks.at(-1)![6], 1)
  const drafts = useDrafts({
    status: 'approved',
    scheduled_from: from.toISOString(),
    scheduled_to: to.toISOString(),
  })
  const upNext = useDrafts({ status: 'approved', scheduled_from: now.toISOString() })
  const items = drafts.data?.items ?? []

  const step = (n: number) =>
    setCursor((c) =>
      view === 'week' ? addDays(c, 7 * n) : new Date(c.getFullYear(), c.getMonth() + n, 1),
    )
  const title =
    view === 'week'
      ? `${rangeDay.format(from)} – ${rangeDay.format(addDays(to, -1))}`
      : monthName.format(cursor)

  function drop(id: string, day: Date, hour?: number) {
    const d = items.find((x) => x.id === id)
    if (!d?.scheduled_for) return
    const h = hour ?? new Date(d.scheduled_for).getHours()
    const when = moveTo(d.scheduled_for, day, h)
    if (when !== d.scheduled_for) patch.mutate({ id, scheduled_for: when })
  }

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-12 md:px-10 md:py-14">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Calendar</h1>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => step(-1)}
            aria-label={`Previous ${view}`}
            className="grid size-9 place-items-center rounded-control hover:bg-sunken"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => setCursor(new Date())}
            className="min-h-9 rounded-control border border-edge px-3 text-sm"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => step(1)}
            aria-label={`Next ${view}`}
            className="grid size-9 place-items-center rounded-control hover:bg-sunken"
          >
            ›
          </button>
        </div>
        <p className="font-semibold" aria-live="polite">
          {title}
        </p>
        <div
          role="group"
          aria-label="View"
          className="ml-auto flex rounded-control border border-line p-0.5"
        >
          {(['week', 'month'] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => setView(v)}
              className={`min-h-8 rounded-control px-3 text-sm ${view === v ? 'bg-sunken font-semibold' : 'text-muted'}`}
            >
              {v === 'week' ? 'Week' : 'Month'}
            </button>
          ))}
        </div>
      </div>

      <UpNext items={upNext.data?.items.slice(0, 3) ?? []} />

      {(patch.error ?? drafts.error) && (
        <p role="alert" className="mt-4 text-sm text-danger">
          {(patch.error ?? drafts.error)?.message}
        </p>
      )}

      {view === 'week' ? (
        <WeekGrid days={weeks[0]} items={items} now={now} onDrop={drop} patch={patch} />
      ) : (
        <MonthGrid
          weeks={weeks}
          month={cursor.getMonth()}
          items={items}
          now={now}
          onDrop={drop}
          patch={patch}
        />
      )}

      {drafts.isSuccess && !items.length && (
        <p className="mt-4 text-sm text-muted">
          Nothing scheduled here. Approve a draft and pick a time:{' '}
          <Link to="/drafts" className="text-thread underline underline-offset-4">
            open Drafts
          </Link>
          .
        </p>
      )}
    </div>
  )
}

function UpNext({ items }: { items: DraftRow[] }) {
  if (!items.length) return null
  return (
    <section aria-labelledby="up-next" className="mt-6">
      <h2 id="up-next" className="text-sm font-semibold text-muted">
        Up next
      </h2>
      <ol className="mt-2 flex flex-wrap gap-2">
        {items.map((d) => (
          <li key={d.id}>
            <Link
              to={`/drafts/${d.id}`}
              className="block rounded-control border border-line bg-surface px-3 py-2 text-sm hover:border-edge"
            >
              <span className="font-semibold">{formatWhen(d.scheduled_for!)}</span>{' '}
              <span className="text-muted">{d.text.split('\n')[0].slice(0, 40)}</span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  )
}

type GridProps = {
  items: DraftRow[]
  now: Date
  onDrop: (id: string, day: Date, hour?: number) => void
  patch: ReturnType<typeof usePatchAnyDraft>
}

function at(items: DraftRow[], day: Date, hour?: number) {
  return items.filter((d) => {
    const t = new Date(d.scheduled_for!)
    return sameDay(t, day) && (hour === undefined || t.getHours() === hour)
  })
}

function WeekGrid({ days, items, now, onDrop, patch }: GridProps & { days: Date[] }) {
  const scroller = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = ROW * 8 // open at 08:00
  }, [])
  return (
    <>
      {/* Phones: a list per day; same items, same Move to… and Posted. */}
      <ol className="mt-6 flex flex-col gap-4 md:hidden">
        {days.map((day) => (
          <li key={day.toISOString()}>
            <h3 className={`text-sm font-semibold ${sameDay(day, now) ? 'text-thread' : ''}`}>
              {dayName.format(day)} {day.getDate()}
            </h3>
            <div className="mt-1 flex flex-col gap-2">
              {at(items, day).map((d) => (
                <CalendarItem key={d.id} draft={d} patch={patch} />
              ))}
              {!at(items, day).length && <p className="text-xs text-muted">Nothing planned.</p>}
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-6 hidden overflow-hidden rounded-panel border border-line bg-paper md:block">
        <div className="grid grid-cols-[64px_repeat(7,minmax(0,1fr))] border-b border-line">
          <span />
          {days.map((day) => (
            <div
              key={day.toISOString()}
              className={`border-l border-line px-2 py-2 text-center text-sm ${sameDay(day, now) ? 'font-semibold text-thread' : ''}`}
            >
              {dayName.format(day)} <span className="tabular-nums">{day.getDate()}</span>
            </div>
          ))}
        </div>
        <div ref={scroller} className="max-h-[65vh] overflow-y-auto">
          {HOURS.map((h) => (
            <div
              key={h}
              className="grid grid-cols-[64px_repeat(7,minmax(0,1fr))]"
              style={{ minHeight: ROW }}
            >
              <span className="pt-1 pr-2 text-right text-xs text-muted tabular-nums">
                {hourLabel(h)}
              </span>
              {days.map((day) => (
                <div
                  key={day.toISOString()}
                  data-slot={`${day.getDate()}-${h}`}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault()
                    onDrop(e.dataTransfer.getData('text/plain'), day, h)
                  }}
                  className="flex flex-col gap-1 border-t border-l border-line p-1"
                >
                  {at(items, day, h).map((d) => (
                    <CalendarItem key={d.id} draft={d} patch={patch} compact />
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

function MonthGrid({
  weeks,
  month,
  items,
  now,
  onDrop,
  patch,
}: GridProps & { weeks: Date[][]; month: number }) {
  return (
    <div className="mt-6 overflow-hidden rounded-panel border border-line bg-paper">
      <div className="grid grid-cols-7 border-b border-line text-center text-sm text-muted">
        {weeks[0].map((d) => (
          <span key={d.toISOString()} className="py-2">
            {dayName.format(d)}
          </span>
        ))}
      </div>
      {weeks.map((week) => (
        <div key={week[0].toISOString()} className="grid grid-cols-7">
          {week.map((day) => (
            <div
              key={day.toISOString()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                onDrop(e.dataTransfer.getData('text/plain'), day)
              }}
              className={`flex min-h-28 flex-col gap-1 border-t border-l border-line p-1 ${day.getMonth() !== month ? 'bg-sunken/50' : ''}`}
            >
              <span
                className={`text-xs tabular-nums ${sameDay(day, now) ? 'font-semibold text-thread' : 'text-muted'}`}
              >
                {day.getDate()}
              </span>
              {at(items, day).map((d) => (
                <CalendarItem key={d.id} draft={d} patch={patch} compact />
              ))}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
