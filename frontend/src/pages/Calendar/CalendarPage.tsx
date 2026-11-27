import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useDrafts, usePatchAnyDraft } from '../../api/drafts'
import { useNotifications, useZone } from '../../api/me'
import type { DraftRow } from '../../api/types'
import { HandOffPrompt } from '../../components/HandOffPrompt'
import { PlatformMark } from '../../components/PlatformMark'
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/popover'
import {
  addDays,
  dayKey,
  dropTime,
  fromDayKey,
  slotOf,
  startOfWeek,
  weekDays,
} from '../../lib/calendar'
import { formatShort } from '../../lib/time'
import { useHandOff } from '../../lib/useHandOff'
import { useMedia } from '../../lib/useMedia'
import { useMoveDrag, type DropTarget } from '../../lib/useMoveDrag'
import { cn } from '../../lib/utils'
import { ItemDetails, StatusTag, itemState, useBotSends } from './CalendarItem'
import { TodayList, WeekGrid, WeekList } from './Grids'

type View = 'today' | 'week'
const VIEWS: View[] = ['today', 'week']
const shortDay = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' })
const todayName = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
})

/**
 * Calendar (DESIGN.md §4.3): your plan, which post goes out on which platform and when, in your
 * own time. Today (a list with each post's actions in view) or Week (seven days, twelve
 * two-hour rows on a computer; a list by day on a phone). "Needs you" holds what is due or
 * missed. Weeks go forward from this one: posted posts leave once their week is over. Drag a
 * post to another day or row, or use its Change time. The view and date live in the address.
 */
export function CalendarPage() {
  const [params, setParams] = useSearchParams()
  // The seven-day grid needs about 90px a day beside the sidebar; narrower screens (phones,
  // phones in desktop mode, small tablets) get the week as a list instead.
  const wide = useMedia('(min-width: 1024px)')
  const view: View = VIEWS.includes(params.get('view') as View)
    ? (params.get('view') as View)
    : wide
      ? 'week'
      : 'today'
  const now = useNow()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const thisWeek = startOfWeek(today)
  // Forward only: an earlier week in the address shows this one.
  const asked = startOfWeek(parseDate(params.get('date')))
  const monday = asked < thisWeek ? thisWeek : asked
  const days = weekDays(monday)
  const from = view === 'today' ? today : monday
  const to = view === 'today' ? addDays(today, 1) : addDays(monday, 7)
  const notifications = useNotifications().data
  const [dropNote, setDropNote] = useState('')
  const patch = usePatchAnyDraft()

  const go = (next: View, date: Date) => setParams({ view: next, date: dayKey(date) })

  const range = { scheduled_from: from.toISOString(), scheduled_to: to.toISOString() }
  const approved = useDrafts({ status: 'approved', ...range })
  const posted = useDrafts({ status: 'published', ...range })
  const items = [...(approved.data?.items ?? []), ...(posted.data?.items ?? [])]
  const pending = approved.isPending || posted.isPending
  // Today already shows its posts in full with Post now, so "Needs you" leaves them out there.
  const shown = new Set(view === 'today' ? items.map((d) => d.id) : [])
  const needs = [...(notifications?.missed ?? []), ...(notifications?.due ?? [])].filter(
    (d) => !shown.has(d.id),
  )
  const loaded = approved.isSuccess && posted.isSuccess

  const onDrop = useCallback(
    (id: string, target: DropTarget) => {
      const d = items.find((x) => x.id === id)
      if (!d?.scheduled_for) return
      const slot = target.hour ?? slotOf(new Date(d.scheduled_for).getHours())
      const when = dropTime(d.scheduled_for, fromDayKey(target.day), slot)
      // Same check as Change time's picker: a time that has passed would be missed at once.
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

  const isThisWeek = monday.getTime() === thisWeek.getTime()
  const span = `${shortDay.format(monday)} – ${shortDay.format(days[6])}`
  const title =
    view === 'today'
      ? `Today · ${todayName.format(today)}`
      : isThisWeek
        ? `This week · ${span}`
        : addDays(thisWeek, 7).getTime() === monday.getTime()
          ? `Next week · ${span}`
          : span

  return (
    <div className="mx-auto max-w-wide px-4 py-10 md:px-10 md:py-14">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">Calendar</h1>
        {view === 'week' && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => go('week', addDays(monday, -7))}
              disabled={isThisWeek}
              aria-label="Previous week"
              className="grid size-9 place-items-center rounded-control text-lg hover:bg-sunken disabled:opacity-30 disabled:hover:bg-transparent"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => go('week', addDays(monday, 7))}
              aria-label="Next week"
              className="grid size-9 place-items-center rounded-control text-lg hover:bg-sunken"
            >
              ›
            </button>
          </div>
        )}
        <p className="font-semibold" aria-live="polite">
          {title}
        </p>
        <div
          role="group"
          aria-label="View"
          className="ml-auto flex rounded-full border border-line bg-surface p-0.5"
        >
          {VIEWS.map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => go(v, v === 'week' ? monday : today)}
              className={cn(
                'min-h-8 rounded-full px-4 text-sm capitalize transition-colors duration-(--duration) ease-(--ease)',
                view === v
                  ? 'bg-primary font-semibold text-on-primary'
                  : 'text-muted hover:text-ink',
              )}
            >
              {v}
            </button>
          ))}
        </div>
      </header>

      {needs.length > 0 && (
        <section aria-labelledby="needs-you" className="mt-6 rounded-panel border border-danger/60">
          <h2 id="needs-you" className="px-4 pt-3 text-sm font-semibold text-danger">
            Needs you
          </h2>
          <ul className="mt-1 divide-y divide-line">
            {needs.map((d) => (
              <NeedsYouRow key={d.id} draft={d} now={now} patch={patch} />
            ))}
          </ul>
        </section>
      )}

      {(patch.error ?? approved.error ?? posted.error) && (
        <p role="alert" className="mt-4 text-sm text-danger">
          {(patch.error ?? approved.error ?? posted.error)?.message}
        </p>
      )}
      <p role="status" className={cn('text-sm text-danger', dropNote && 'mt-4')}>
        {dropNote}
      </p>

      {pending && <p className="mt-6 text-sm text-muted">Loading your calendar…</p>}
      {loaded && !items.length && (
        <div className="mt-6 rounded-panel border border-dashed border-edge px-6 py-10 text-center">
          <p className="text-muted">
            {view === 'today' ? 'Nothing planned today.' : 'Nothing planned this week.'}
          </p>
          <Link
            to="/"
            className="mt-4 inline-flex min-h-10 items-center rounded-full bg-primary px-5 font-semibold text-on-primary"
          >
            Write a post
          </Link>
        </div>
      )}

      <div
        className={cn(
          'mt-6 transition-opacity duration-(--duration) ease-(--ease)',
          pending && 'opacity-50',
        )}
      >
        {view === 'today' && <TodayList day={today} {...shared} />}
        {view === 'week' &&
          (wide ? <WeekGrid days={days} {...shared} /> : <WeekList days={days} {...shared} />)}
      </div>
    </div>
  )
}

/** One due or missed post: Post now in view, Change time opens the picker. */
function NeedsYouRow({
  draft,
  now,
  patch,
}: {
  draft: DraftRow
  now: Date
  patch: ReturnType<typeof usePatchAnyDraft>
}) {
  const zone = useZone()
  const hand = useHandOff(draft)
  const bot = useBotSends(draft)
  const [open, setOpen] = useState(false)
  const state = itemState(draft, now)
  const firstLine = draft.text.split('\n').find((l) => l.trim()) ?? ''
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 text-sm">
      <PlatformMark platform={draft.platform} />
      <span className="font-semibold tabular-nums">{formatShort(draft.scheduled_for!, zone)}</span>
      <span className="min-w-0 flex-1 truncate text-muted">{firstLine}</span>
      <span className="text-xs">
        <StatusTag state={state} bot={bot} />
      </span>
      <span className="flex gap-2">
        <button
          type="button"
          disabled={hand.posting}
          onClick={() => void hand.post()}
          title={hand.detail}
          className="min-h-9 rounded-full bg-primary px-3 font-semibold text-on-primary"
        >
          {hand.posting ? 'Posting…' : hand.label}
        </button>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="min-h-9 rounded-full border border-edge px-3 hover:bg-sunken"
            >
              Change time
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80">
            <ItemDetails
              draft={draft}
              state={state}
              patch={patch}
              startMoving
              onDone={() => setOpen(false)}
            />
          </PopoverContent>
        </Popover>
      </span>
      {(hand.asked || hand.failed || hand.note) && (
        <div className="w-full">
          <HandOffNote hand={hand} />
        </div>
      )}
    </li>
  )
}

function HandOffNote({ hand }: { hand: ReturnType<typeof useHandOff> }) {
  if (hand.asked) return <HandOffPrompt hand={hand} />
  if (hand.failed)
    return (
      <p role="alert" className="text-danger">
        {hand.failed}
      </p>
    )
  return <p className="text-muted">{hand.note}</p>
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
