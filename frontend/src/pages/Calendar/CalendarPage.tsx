import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useDrafts, usePatchAnyDraft } from '../../api/drafts'
import { useNotifications, useZone } from '../../api/me'
import { useBestHours } from '../../api/platforms'
import type { DraftRow, Platform } from '../../api/types'
import {
  addDays,
  dayKey,
  fromDayKey,
  monthWeeks,
  moveTo,
  startOfWeek,
  weekDays,
} from '../../lib/calendar'
import { LABEL, PLATFORMS } from '../../lib/platforms'
import { formatWhen } from '../../lib/time'
import { useMedia } from '../../lib/useMedia'
import { useMoveDrag, type DropTarget } from '../../lib/useMoveDrag'
import { cn } from '../../lib/utils'
import { CalendarItem } from './CalendarItem'
import { MonthGrid, TimeGrid, WeekList } from './Grids'

type View = 'month' | 'week' | 'day'
const VIEWS: View[] = ['month', 'week', 'day']
const SHADE_KEY = 'voxlace-calendar-shade'
const monthName = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' })
const rangeDay = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' })
const fullDay = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
})

function savedShade(): Platform | 'off' {
  try {
    const v = localStorage.getItem(SHADE_KEY)
    return v === 'off' || PLATFORMS.includes(v as Platform) ? (v as Platform | 'off') : 'x'
  } catch {
    return 'x'
  }
}

/**
 * Calendar (DESIGN.md §4.3): approved posts by month, week or day, in your own time. Drag a
 * post to another slot (mouse or touch), or open it for Move to…, Edit and Posted. The week
 * and day views shade the best hours of one platform's audience (FR-16). The view and the
 * date live in the address, so Back works and a link opens the same view.
 */
export function CalendarPage() {
  const [params, setParams] = useSearchParams()
  const view: View = VIEWS.includes(params.get('view') as View)
    ? (params.get('view') as View)
    : 'week'
  const cursor = parseDate(params.get('date'))
  const now = useNow()
  // Fixed for the page's life: a key that changed each minute would refetch and blink.
  const [since] = useState(() => new Date().toISOString())
  const wide = useMedia('(min-width: 768px)')
  const due = useNotifications().data?.due ?? []
  // The grid draws in the browser's zone. Best hours come in the account's zone, so when the
  // two differ (travelling, or a zone set by hand) they'd land on the wrong rows: say so instead.
  const zone = useZone()
  const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const otherZone = zone && zone !== 'UTC' && zone !== browserZone ? zone : null
  const [shade, setShade] = useState(savedShade)
  const [dropNote, setDropNote] = useState('')
  const patch = usePatchAnyDraft()

  const go = (next: View, date: Date) => setParams({ view: next, date: dayKey(date) })

  const days =
    view === 'day' ? [new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate())] : []
  const weeks = view === 'month' ? monthWeeks(cursor) : [weekDays(startOfWeek(cursor))]
  const visible = view === 'day' ? days : weeks.flat()
  const from = visible[0]
  const to = addDays(visible.at(-1)!, 1)

  const drafts = useDrafts({
    status: 'approved',
    scheduled_from: from.toISOString(),
    scheduled_to: to.toISOString(),
  })
  const upNext = useDrafts({ status: 'approved', scheduled_from: since })
  const items = drafts.data?.items ?? []

  const bestHours = useBestHours(
    shade === 'off' ? 'x' : shade,
    dayKey(from),
    view === 'day' ? 1 : 7,
    // Phones show the week as a list with no shading, so they skip it there.
    !otherZone && shade !== 'off' && (view === 'day' || (view === 'week' && wide)),
  )
  const best: Record<string, number[]> = Object.fromEntries(
    (bestHours.data?.days ?? []).map((d) => [d.date, d.best]),
  )

  const onDrop = useCallback(
    (id: string, target: DropTarget) => {
      const d = items.find((x) => x.id === id)
      if (!d?.scheduled_for) return
      const hour = target.hour ?? new Date(d.scheduled_for).getHours()
      const when = moveTo(d.scheduled_for, fromDayKey(target.day), hour)
      // Same check as Move to…'s picker: a time that has passed would be missed at once.
      if (new Date(when) <= new Date()) {
        setDropNote('That time has passed. Drop it on a later slot.')
        return
      }
      setDropNote('')
      if (when !== d.scheduled_for) patch.mutate({ id, scheduled_for: when })
    },
    [items, patch],
  )
  const move = useMoveDrag(onDrop)
  const shared = { items, now, patch, move }

  const step = (n: number) => {
    if (view === 'day') go(view, addDays(cursor, n))
    else if (view === 'week') go(view, addDays(cursor, 7 * n))
    else go(view, new Date(cursor.getFullYear(), cursor.getMonth() + n, 1))
  }
  const title =
    view === 'day'
      ? fullDay.format(cursor)
      : view === 'week'
        ? `${rangeDay.format(from)} – ${rangeDay.format(addDays(to, -1))}`
        : monthName.format(cursor)

  function pickShade(next: Platform | 'off') {
    setShade(next)
    try {
      localStorage.setItem(SHADE_KEY, next)
    } catch {
      // Private mode: the choice lasts for this page only.
    }
  }

  const control = 'min-h-9 rounded-control px-3 text-sm'
  return (
    <div className="mx-auto max-w-wide px-4 py-10 md:px-10 md:py-14">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
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
            onClick={() => go(view, new Date())}
            className={cn(control, 'border border-edge hover:bg-sunken')}
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
          {VIEWS.map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => go(v, cursor)}
              className={cn(
                'min-h-8 rounded-control px-3 text-sm capitalize',
                view === v ? 'bg-sunken font-semibold' : 'text-muted hover:text-ink',
              )}
            >
              {v}
            </button>
          ))}
        </div>
      </header>

      {otherZone && (
        <p className="mt-4 text-sm text-muted">
          Times here are in this device's zone ({browserZone}). Your account uses {otherZone};
          change it in Profile to see your best hours.
        </p>
      )}
      {view !== 'month' && !otherZone && (
        <div
          role="group"
          aria-label="Shade the best hours for"
          className="mt-4 flex flex-wrap items-center gap-2 text-sm"
        >
          <span className="text-muted">Best hours for</span>
          {[...PLATFORMS, 'off' as const].map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={shade === p}
              onClick={() => pickShade(p)}
              className={cn(
                'min-h-8 rounded-full border px-3',
                shade === p
                  ? 'border-primary bg-primary font-semibold text-on-primary'
                  : 'border-line text-muted hover:border-edge hover:text-ink',
              )}
            >
              {p === 'off' ? 'Off' : LABEL[p]}
            </button>
          ))}
          {shade !== 'off' && (
            <span className="flex items-center gap-1.5 text-xs text-muted">
              <span
                aria-hidden="true"
                className="size-3 rounded-sm border-l-2 border-edge bg-sunken ring-1 ring-line"
              />
              marked like this, in your time
              {bestHours.data?.source === 'your_posts' && ', from your own posts'}
            </span>
          )}
        </div>
      )}

      {due.length > 0 && (
        <section aria-labelledby="due-now" className="mt-6 rounded-panel border border-signal p-4">
          <h2 id="due-now" className="text-sm font-semibold text-signal">
            Due now
          </h2>
          <p className="mt-1 text-sm text-muted">
            Post these, then press Posted. Voxlace never posts for you.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {due.map((d) => (
              <CalendarItem key={d.id} draft={d} state="due" patch={patch} />
            ))}
          </div>
        </section>
      )}

      <UpNext
        items={(upNext.data?.items ?? [])
          .filter((d) => new Date(d.scheduled_for!) > now)
          .slice(0, 3)}
      />

      {(patch.error ?? drafts.error) && (
        <p role="alert" className="mt-4 text-sm text-danger">
          {(patch.error ?? drafts.error)?.message}
        </p>
      )}
      <p role="status" className={cn('text-sm text-danger', dropNote && 'mt-4')}>
        {dropNote}
      </p>

      {drafts.isPending && <p className="mt-4 text-sm text-muted">Loading your calendar…</p>}
      {drafts.isSuccess && !items.length && (
        <p className="mt-4 text-sm text-muted">
          Approve a draft and pick a time to see it here.{' '}
          <Link to="/drafts" className="text-thread underline underline-offset-4">
            Open Drafts
          </Link>
        </p>
      )}

      <div
        className={cn(
          'mt-6 transition-opacity duration-(--duration) ease-(--ease)',
          drafts.isPending && 'opacity-50',
        )}
      >
        {view === 'month' && (
          <MonthGrid
            weeks={weeks}
            month={cursor.getMonth()}
            onOpenDay={(day) => go('day', day)}
            {...shared}
          />
        )}
        {view === 'week' && (
          <>
            <div className="md:hidden">
              <WeekList days={weeks[0]} {...shared} />
            </div>
            <div className="hidden md:block">
              <TimeGrid
                days={weeks[0]}
                best={shade === 'off' ? {} : best}
                bestFor={shade === 'off' ? null : LABEL[shade]}
                {...shared}
              />
            </div>
          </>
        )}
        {view === 'day' && (
          <TimeGrid
            days={days}
            best={shade === 'off' ? {} : best}
            bestFor={shade === 'off' ? null : LABEL[shade]}
            {...shared}
          />
        )}
      </div>
    </div>
  )
}

/** The `date` in the address, or today when it's missing or not a real day. */
function parseDate(raw: string | null): Date {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return new Date()
  const d = fromDayKey(raw)
  return Number.isNaN(d.getTime()) || dayKey(d) !== raw ? new Date() : d
}

/** The current time, updated each minute, so a post turns due, then missed, while you watch. */
function useNow() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])
  return now
}

function UpNext({ items }: { items: DraftRow[] }) {
  const zone = useZone()
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
              <span className="font-semibold">{formatWhen(d.scheduled_for!, zone)}</span>{' '}
              <span className="text-muted">{d.text.split('\n')[0].slice(0, 40)}</span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  )
}
