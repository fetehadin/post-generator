import { useEffect, useId, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useDraftStats } from '../../api/account'
import { useDrafts, usePatchAnyDraft } from '../../api/drafts'
import { useZone } from '../../api/me'
import { usePlatform } from '../../api/platforms'
import { useDeleteDraft, useScheduleDraft } from '../../api/threads'
import type { DraftRow, DraftStatus, Platform } from '../../api/types'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { DayChips } from '../../components/DayChips'
import { LengthCounter } from '../../components/LengthCounter'
import { PlatformMark } from '../../components/PlatformMark'
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/popover'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs'
import { handOff, handOffLabel } from '../../lib/handoff'
import { LABEL, RULES, STATUS_LABEL } from '../../lib/platforms'
import { dateIn, formatShort, formatWhen } from '../../lib/time'
import { cn } from '../../lib/utils'

const TABS: Array<{ status: DraftStatus; label: string; empty: string }> = [
  { status: 'draft', label: 'Drafts', empty: 'Your drafts will appear here. Start a chat.' },
  {
    status: 'approved',
    label: 'Approved',
    empty: 'Approve a draft and pick a day to see it here.',
  },
  { status: 'published', label: 'Posted', empty: 'Posts you mark as posted appear here.' },
  { status: 'discarded', label: 'Discarded', empty: 'Nothing discarded.' },
]
const button =
  'inline-flex min-h-9 items-center rounded-control border border-edge px-3 text-sm hover:bg-sunken disabled:opacity-50'
const primary =
  'inline-flex min-h-9 items-center rounded-control bg-primary px-3 text-sm font-semibold text-on-primary disabled:opacity-50'

const pct = (n: number) => `${Math.round(n * 100)}%`

/**
 * One platform's drafts by status (DESIGN.md §4.2, FR-10, FR-11, FR-12). Each card: status,
 * the first lines, the length or the time, then its actions: Approve or Reschedule (pick a
 * day; the hour is picked for you), Copy now on approved posts only (rule 4), Discard with
 * Undo, and Edit in chat. Discarded has Restore and Delete forever.
 */
export function DraftsPage({ platform }: { platform: Platform }) {
  const [params, setParams] = useSearchParams()
  const status = (TABS.find((t) => t.status === params.get('status')) ?? TABS[0]).status
  const drafts = useDrafts({ platform, status })
  // The undo lives here: a discarded card leaves its list, so it can't hold its own Undo.
  const [discarded, setDiscarded] = useState<DraftRow | null>(null)
  useEffect(() => setDiscarded(null), [status, platform])

  return (
    <div className="mx-auto max-w-column px-4 py-12 md:px-6 md:py-16">
      <h1 className="flex items-center gap-3 text-2xl font-semibold tracking-tight">
        <PlatformMark platform={platform} />
        {LABEL[platform]} drafts
      </h1>
      <WeekStats />
      <Tabs
        value={status}
        onValueChange={(v) => setParams(v === 'draft' ? {} : { status: v })}
        className="mt-6"
      >
        <TabsList
          variant="line"
          aria-label="Status"
          className="w-full justify-start border-b border-line"
        >
          {TABS.map((t) => (
            <TabsTrigger key={t.status} value={t.status} className="flex-none px-3">
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {TABS.map((t) => (
          <TabsContent key={t.status} value={t.status} className="mt-2">
            {t.status === status && (
              <>
                {discarded && <UndoBar draft={discarded} onDone={() => setDiscarded(null)} />}
                {drafts.isError && (
                  <p role="alert" className="text-danger">
                    {drafts.error.message}
                  </p>
                )}
                {drafts.isPending && <p className="text-muted">Loading…</p>}
                {drafts.data &&
                  (drafts.data.items.length ? (
                    <ul className="flex flex-col gap-3">
                      {drafts.data.items.map((d) => (
                        <li key={d.id}>
                          <DraftItem draft={d} onDiscarded={() => setDiscarded(d)} />
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="rounded-panel border border-dashed border-edge p-6 text-center">
                      <p className="text-muted">{t.empty}</p>
                      {status === 'draft' && (
                        <Link to="/" className={cn(primary, 'mt-3')}>
                          Start a chat
                        </Link>
                      )}
                    </div>
                  ))}
              </>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}

/** FR-15: how much of what's written gets posted, and how much it's edited first. */
function WeekStats() {
  const stats = useDraftStats().data
  if (!stats?.created) return null
  return (
    <p className="mt-1 text-sm text-muted">
      Last 7 days: {stats.created} {stats.created === 1 ? 'draft' : 'drafts'}, {stats.published}{' '}
      posted ({pct(stats.publish_rate ?? 0)})
      {stats.edited !== null && `, edited ${pct(stats.edited)} on average before posting`}.
    </p>
  )
}

/**
 * "Moved to Discarded. Undo." Undo puts it back as it was: a draft, or an approved post at its
 * old time (discarding cleared the time, so it's scheduled again at exactly that time).
 */
function UndoBar({ draft, onDone }: { draft: DraftRow; onDone: () => void }) {
  const zone = useZone()
  const patch = usePatchAnyDraft()
  const schedule = useScheduleDraft()
  const undoRef = useRef<HTMLButtonElement>(null)
  // The card that had focus is gone; focus goes to Undo so the keyboard isn't lost.
  useEffect(() => undoRef.current?.focus(), [])
  const error = patch.error ?? schedule.error

  function undo() {
    patch.mutate(
      { id: draft.id, status: 'draft' },
      {
        onSuccess: () => {
          const at = draft.scheduled_for
          if (draft.status === 'approved' && at && Date.parse(at) > Date.now())
            schedule.mutate({ draftId: draft.id, day: dateIn(at, zone), at }, { onSuccess: onDone })
          else onDone()
        },
      },
    )
  }

  return (
    <div className="mb-3 rounded-panel bg-sunken px-4 py-2 text-sm">
      <p aria-live="polite" className="flex items-center gap-2">
        Moved to Discarded.
        <button
          ref={undoRef}
          type="button"
          disabled={patch.isPending || schedule.isPending}
          onClick={undo}
          className={button}
        >
          Undo
        </button>
        <button
          type="button"
          onClick={onDone}
          className="ml-auto min-h-9 rounded-control px-2 text-muted hover:bg-line hover:text-ink"
        >
          Dismiss
        </button>
      </p>
      {error && (
        <p role="alert" className="mt-1 text-danger">
          {error.message}
        </p>
      )}
    </div>
  )
}

function DraftItem({ draft, onDiscarded }: { draft: DraftRow; onDiscarded: () => void }) {
  const zone = useZone()
  const channel = usePlatform('telegram', draft.platform === 'telegram').data?.channel
  const patch = usePatchAnyDraft()
  const schedule = useScheduleDraft()
  const remove = useDeleteDraft()
  const [dayOpen, setDayOpen] = useState(false)
  const [asked, setAsked] = useState(false)
  const [note, setNote] = useState('')
  const [failed, setFailed] = useState('')
  const lengthId = useId()
  const name = LABEL[draft.platform]
  const lines = draft.text.split('\n').filter((l) => l.trim())
  const when = draft.scheduled_for
  const live = draft.status === 'draft' || draft.status === 'approved'
  const missed = draft.status === 'approved' && when && Date.parse(when) < Date.now() - 30 * 60_000
  const over = draft.length.over

  async function copyNow() {
    setFailed('')
    try {
      const { copied } = await handOff(draft, channel)
      if (copied === false) setFailed("Couldn't copy: open the draft and copy it by hand.")
      setNote(
        draft.platform === 'telegram' && !channel
          ? 'Copied. Open your channel in Telegram and paste it.'
          : copied
            ? 'Copied.'
            : '',
      )
      setAsked(true)
    } catch (e) {
      setFailed((e as Error).message)
    }
  }

  return (
    <article
      aria-label={`${name} ${STATUS_LABEL[draft.status].toLowerCase()}: ${lines[0] ?? ''}`}
      className={cn(
        'rounded-panel border bg-surface p-4',
        missed ? 'border-danger' : 'border-line',
      )}
    >
      <p className="mb-2 flex items-center gap-2 text-xs">
        <span className="rounded-full border border-line px-2 text-muted">
          {STATUS_LABEL[draft.status]}
        </span>
        <span className="rounded-full border border-thread px-2 text-thread">AI draft</span>
      </p>
      <p className="line-clamp-3 font-serif text-lg leading-writing whitespace-pre-line">
        {lines.slice(0, 3).join('\n')}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 text-sm">
        {live && (
          <span id={lengthId}>
            <LengthCounter
              text={draft.text}
              rule={RULES[draft.platform]}
              limit={draft.length.limit}
            />
          </span>
        )}
        <span className={missed ? 'text-danger' : 'text-muted'}>
          {draft.status === 'published' && draft.published_at
            ? `Posted ${formatWhen(draft.published_at, zone)}`
            : missed
              ? `${formatShort(when, zone)} passed. Post now or reschedule.`
              : when
                ? `${formatWhen(when, zone)} your time`
                : ''}
        </span>
      </div>

      {asked ? (
        <div aria-live="polite" className="mt-3 text-sm">
          {note && <p>{note}</p>}
          <p className="mt-1">Did you post it?</p>
          <div className="mt-1 flex gap-2">
            <button
              type="button"
              disabled={patch.isPending}
              onClick={() => patch.mutate({ id: draft.id, status: 'published' })}
              className={primary}
            >
              Yes, mark as posted
            </button>
            <button
              type="button"
              onClick={() => {
                setAsked(false)
                setNote('')
              }}
              className={button}
            >
              Not yet
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {live && (
            <Popover open={dayOpen} onOpenChange={setDayOpen}>
              <PopoverTrigger
                disabled={over}
                aria-describedby={over ? lengthId : undefined}
                className={draft.status === 'draft' ? primary : button}
              >
                {draft.status === 'draft' ? 'Approve and pick a day' : 'Reschedule'}
              </PopoverTrigger>
              <PopoverContent align="start" className="w-80">
                <DayChips
                  timeZone={zone}
                  busy={schedule.isPending}
                  label={draft.status === 'draft' ? 'Which day?' : 'Move it to which day?'}
                  onPick={(day) =>
                    schedule.mutate(
                      { draftId: draft.id, day },
                      { onSuccess: () => setDayOpen(false) },
                    )
                  }
                />
                {schedule.error && (
                  <p role="alert" className="mt-2 text-sm text-danger">
                    {schedule.error.message}
                  </p>
                )}
              </PopoverContent>
            </Popover>
          )}
          {draft.status === 'approved' && (
            <button
              type="button"
              disabled={over}
              aria-describedby={over ? lengthId : undefined}
              onClick={() => void copyNow()}
              className={primary}
            >
              {handOffLabel(draft.platform, channel)}
            </button>
          )}
          {draft.status === 'discarded' && (
            <>
              <button
                type="button"
                disabled={patch.isPending}
                onClick={() => patch.mutate({ id: draft.id, status: 'draft' })}
                className={button}
              >
                Restore
              </button>
              <ConfirmDialog
                trigger="Delete forever"
                triggerClassName={cn(button, 'text-danger')}
                title="Delete this draft forever?"
                description="It and all its versions are removed. This can't be undone."
                confirm="Delete forever"
                busy={remove.isPending}
                error={remove.error?.message}
                onConfirm={() => remove.mutate(draft.id)}
              />
            </>
          )}
          {live && (
            <button
              type="button"
              disabled={patch.isPending}
              onClick={() =>
                patch.mutate({ id: draft.id, status: 'discarded' }, { onSuccess: onDiscarded })
              }
              className={button}
            >
              Discard
            </button>
          )}
          <Link
            to={draft.thread_id ? `/chat/${draft.thread_id}` : `/drafts/${draft.id}`}
            state={{ draft: draft.id }}
            className="ml-auto min-h-9 px-1 py-2 text-sm text-thread underline underline-offset-4"
          >
            Edit in chat
          </Link>
        </div>
      )}
      {(failed || patch.error) && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {failed || patch.error?.message}
        </p>
      )}
    </article>
  )
}
