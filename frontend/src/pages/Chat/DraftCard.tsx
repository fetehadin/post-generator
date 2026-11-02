import { useEffect, useRef, useState } from 'react'
import { usePatchAnyDraft, useRestoreVersion } from '../../api/drafts'
import { useMe, useZone } from '../../api/me'
import { usePlatform } from '../../api/platforms'
import { useConvertDraft, useScheduleDraft } from '../../api/threads'
import type { DraftRow, ScheduleResult, ThreadCard } from '../../api/types'
import { DayChips } from '../../components/DayChips'
import { Icon } from '../../components/Icon'
import { LengthCounter } from '../../components/LengthCounter'
import { PlatformMark } from '../../components/PlatformMark'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu'
import { cn } from '../../lib/utils'
import { handOff, handOffLabel } from '../../lib/handoff'
import { LABEL, PLATFORMS, RULES, STATUS_LABEL } from '../../lib/platforms'
import { dateIn, formatShort, formatWhen, localToUtc } from '../../lib/time'
import { Preview } from '../Editor/Preview'

const button =
  'min-h-9 rounded-control border border-edge px-3 text-sm hover:bg-sunken disabled:opacity-50'
const primary =
  'min-h-9 rounded-control bg-primary px-3 text-sm font-semibold text-on-primary disabled:opacity-50'

/** An older version, folded to its first line (DESIGN.md §4.1). Opens to read or restore. */
export function FoldedCard({ card, draft }: { card: ThreadCard; draft: DraftRow }) {
  const [open, setOpen] = useState(false)
  const restore = useRestoreVersion(draft.id)
  const name = `${LABEL[draft.platform]} draft · v${card.number}`
  const firstLine = card.text.split('\n').find((l) => l.trim()) ?? ''
  return (
    <div className="rounded-panel bg-sunken text-sm text-muted">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex min-h-10 w-full items-center gap-2 px-4 py-2 text-left"
      >
        <PlatformMark platform={draft.platform} />
        <span className="flex-none">{name}</span>
        {!open && <span className="min-w-0 truncate font-serif">{firstLine}</span>}
        <Icon name={open ? 'chevron-down' : 'chevron-right'} className="ml-auto size-4" />
      </button>
      {open && (
        <div className="px-4 pb-3">
          <p className="font-serif text-md leading-writing whitespace-pre-wrap text-ink">
            {card.text}
          </p>
          {draft.status !== 'published' && (
            <button
              type="button"
              disabled={restore.isPending}
              onClick={() => restore.mutate(card.version_id)}
              className={cn(button, 'mt-2')}
            >
              Restore v{card.number}
            </button>
          )}
          {restore.error && (
            <p role="alert" className="mt-1 text-danger">
              {restore.error.message}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * The newest version of a draft, in full (DESIGN.md §4.1): the text in the serif, the length
 * counter and "AI draft" (FR-9, FR-11). Approve asks only for the day; the app picks the hour
 * (FR-45). Copy and open appears only once approved (rule 4).
 */
export function DraftCard({
  card,
  draft,
  selected,
  onSelect,
  onSelectText,
}: {
  card: ThreadCard
  draft: DraftRow
  selected: boolean
  onSelect: () => void
  onSelectText: (text: string) => void
}) {
  const [mode, setMode] = useState<'read' | 'preview' | 'edit' | 'approve' | 'time'>('read')
  const [edited, setEdited] = useState(card.text)
  const [picked, setPicked] = useState<ScheduleResult | null>(null)
  const [note, setNote] = useState('')
  const zone = useZone()
  const name = (useMe().data?.email ?? '').split('@')[0] || 'You'
  const channel = usePlatform('telegram').data?.channel
  const patch = usePatchAnyDraft()
  const schedule = useScheduleDraft()
  const convert = useConvertDraft()
  const label = `${LABEL[draft.platform]} draft · v${card.number}`
  const textRef = useRef<HTMLParagraphElement>(null)
  // A selection inside the draft scopes the next change (§4.1); mouse, keyboard or touch.
  useEffect(() => {
    function changed() {
      const sel = window.getSelection()
      const el = textRef.current
      if (!sel || !el || sel.isCollapsed || !el.contains(sel.anchorNode)) return
      const picked = sel.toString().trim()
      if (picked && card.text.includes(picked)) onSelectText(picked)
    }
    document.addEventListener('selectionchange', changed)
    return () => document.removeEventListener('selectionchange', changed)
  }, [card.text, onSelectText])
  const over = card.length.over
  const error = patch.error ?? schedule.error ?? convert.error

  function approveOn(day: string, at?: string) {
    schedule.mutate(
      { draftId: draft.id, day, at },
      {
        onSuccess: (r) => {
          setPicked(r)
          setMode('read')
        },
      },
    )
  }

  async function post() {
    try {
      const { copied } = await handOff(draft, channel)
      setNote(
        copied === false
          ? "Couldn't copy: select the text and copy it by hand."
          : draft.platform === 'telegram' && !channel
            ? 'Copied. Open your channel in Telegram and paste it. Add the channel name in Profile.'
            : copied
              ? 'Copied.'
              : '',
      )
    } catch (e) {
      setNote((e as Error).message)
    }
  }

  return (
    <article
      aria-label={label}
      className={cn(
        'rounded-panel border bg-surface p-4',
        selected ? 'border-primary' : 'border-line',
      )}
    >
      <header className="flex flex-wrap items-center gap-2 text-sm">
        <PlatformMark platform={draft.platform} />
        <span className="font-semibold">{label}</span>
        <span className="rounded-full border border-line px-2 text-xs text-muted">
          {STATUS_LABEL[draft.status]}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            aria-pressed={mode === 'preview'}
            onClick={() => setMode(mode === 'preview' ? 'read' : 'preview')}
            className={cn(button, 'border-transparent', mode === 'preview' && 'bg-sunken')}
          >
            Preview
          </button>
          <button
            type="button"
            aria-pressed={selected}
            onClick={onSelect}
            className={cn(button, 'border-transparent', selected && 'bg-sunken font-semibold')}
          >
            Reply
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label={`More for the ${LABEL[draft.platform]} draft`}
              className="grid size-9 place-items-center rounded-control text-lg hover:bg-sunken"
            >
              ⋯
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-56">
              {PLATFORMS.filter((p) => p !== draft.platform).map((p) => (
                <DropdownMenuItem
                  key={p}
                  disabled={convert.isPending}
                  onSelect={() => convert.mutate({ draftId: draft.id, platform: p })}
                >
                  <PlatformMark platform={p} />
                  Make {p === 'x' ? 'an' : 'a'} {LABEL[p]} version
                </DropdownMenuItem>
              ))}
              {draft.status !== 'published' && (
                <DropdownMenuItem
                  onSelect={() => {
                    setEdited(card.text)
                    setMode('edit')
                  }}
                >
                  Edit by hand
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              {draft.status === 'discarded' ? (
                <DropdownMenuItem onSelect={() => patch.mutate({ id: draft.id, status: 'draft' })}>
                  Restore draft
                </DropdownMenuItem>
              ) : (
                draft.status !== 'published' && (
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={() => patch.mutate({ id: draft.id, status: 'discarded' })}
                  >
                    Discard
                  </DropdownMenuItem>
                )
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {mode === 'edit' ? (
        <form
          className="mt-3"
          onSubmit={(e) => {
            e.preventDefault()
            patch.mutate({ id: draft.id, text: edited }, { onSuccess: () => setMode('read') })
          }}
        >
          <label className="sr-only" htmlFor={`edit-${draft.id}`}>
            Edit the {LABEL[draft.platform]} draft
          </label>
          <textarea
            id={`edit-${draft.id}`}
            value={edited}
            onChange={(e) => setEdited(e.target.value)}
            className="block w-full resize-y rounded-control border border-edge bg-surface p-3 font-serif text-lg leading-writing [field-sizing:content]"
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <LengthCounter text={edited} rule={RULES[draft.platform]} limit={card.length.limit} />
            <button type="button" onClick={() => setMode('read')} className={cn(button, 'ml-auto')}>
              Cancel
            </button>
            <button
              type="submit"
              disabled={patch.isPending || !edited.trim() || edited === card.text}
              className={primary}
            >
              Save edit
            </button>
          </div>
        </form>
      ) : mode === 'preview' ? (
        <div className="mt-3">
          <Preview platform={draft.platform} text={card.text} name={name} />
        </div>
      ) : (
        <p ref={textRef} className="mt-3 font-serif text-lg leading-writing whitespace-pre-wrap">
          {card.text}
        </p>
      )}

      <footer className="mt-3 flex flex-wrap items-center gap-3">
        {mode !== 'edit' && (
          <LengthCounter text={card.text} rule={RULES[draft.platform]} limit={card.length.limit} />
        )}
        <span className="rounded-full border border-thread px-2 text-xs text-thread">AI draft</span>
      </footer>

      <Status
        draft={draft}
        zone={zone}
        picked={picked}
        over={over}
        mode={mode}
        channel={channel}
        busy={schedule.isPending}
        onApprove={() => setMode(mode === 'approve' ? 'read' : 'approve')}
        onChangeTime={() => setMode(mode === 'time' ? 'read' : 'time')}
        onPick={approveOn}
        onPost={() => void post()}
        onCancel={() => setMode('read')}
      />
      {note && (
        <p aria-live="polite" className="mt-2 text-sm">
          {note}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error.message}
        </p>
      )}
    </article>
  )
}

function Status({
  draft,
  zone,
  picked,
  over,
  mode,
  channel,
  busy,
  onApprove,
  onChangeTime,
  onPick,
  onPost,
  onCancel,
}: {
  draft: DraftRow
  zone?: string
  picked: ScheduleResult | null
  over: boolean
  mode: string
  channel?: string | null
  busy: boolean
  onApprove: () => void
  onChangeTime: () => void
  onPick: (day: string, at?: string) => void
  onPost: () => void
  onCancel: () => void
}) {
  if (draft.status === 'published')
    return (
      <p className="mt-3 text-sm text-muted">
        Posted{draft.published_at ? ` ${formatWhen(draft.published_at, zone)}` : ''}.
      </p>
    )
  if (draft.status === 'discarded')
    return <p className="mt-3 text-sm text-muted">Discarded. Restore it from the ⋯ menu.</p>

  if (draft.status === 'draft')
    return (
      <div className="mt-3">
        <button
          type="button"
          disabled={over}
          aria-expanded={mode === 'approve'}
          onClick={onApprove}
          className={primary}
        >
          Approve and pick a day
        </button>
        {over && <span className="ml-3 text-sm text-danger">Cut it to fit before approving.</span>}
        {mode === 'approve' && (
          <div className="mt-3 rounded-panel border border-line p-3">
            <DayChips timeZone={zone} busy={busy} onPick={(day) => onPick(day)} />
            <button type="button" onClick={onCancel} className={cn(button, 'mt-3')}>
              Cancel
            </button>
          </div>
        )}
      </div>
    )

  // Approved: on the calendar at the picked hour, with why, and the hand-off.
  return (
    <div className="mt-3 text-sm">
      {draft.scheduled_for &&
        (Date.parse(draft.scheduled_for) < Date.now() - 30 * 60_000 ? (
          <p className="text-danger">
            {formatShort(draft.scheduled_for, zone)} passed. Post now or reschedule.
          </p>
        ) : (
          <p>
            <span className="font-semibold">Approved · on your calendar</span>{' '}
            {formatWhen(draft.scheduled_for, zone)} your time
            {picked && <span className="block text-muted">{picked.reason}</span>}
          </p>
        ))}
      {picked?.warning && <p className="mt-1 text-signal">{picked.warning}</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" disabled={over} onClick={onPost} className={primary}>
          {handOffLabel(draft.platform, channel)}
        </button>
        <button
          type="button"
          aria-expanded={mode === 'time'}
          onClick={onChangeTime}
          className={button}
        >
          Change time
        </button>
      </div>
      {mode === 'time' && (
        <ChangeTime draft={draft} zone={zone} busy={busy} onPick={onPick} onCancel={onCancel} />
      )}
    </div>
  )
}

/** Another day (the hour is picked again) or an exact time on the current day. */
function ChangeTime({
  draft,
  zone,
  busy,
  onPick,
  onCancel,
}: {
  draft: DraftRow
  zone?: string
  busy: boolean
  onPick: (day: string, at?: string) => void
  onCancel: () => void
}) {
  const day = draft.scheduled_for ? dateIn(draft.scheduled_for, zone) : dateIn(new Date(), zone)
  const [time, setTime] = useState('')
  return (
    <div className="mt-3 rounded-panel border border-line p-3">
      <DayChips
        timeZone={zone}
        busy={busy}
        label="Move it to which day?"
        onPick={(d) => onPick(d)}
      />
      <form
        className="mt-3 flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (time) onPick(day, localToUtc(day, time, zone))
        }}
      >
        <label htmlFor={`time-${draft.id}`} className="text-sm text-muted">
          Or a time that day ({day})
        </label>
        <input
          id={`time-${draft.id}`}
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          className="min-h-9 rounded-control border border-edge bg-surface px-2 text-sm"
        />
        <button type="submit" disabled={busy || !time} className={button}>
          Use this time
        </button>
        <button type="button" onClick={onCancel} className={button}>
          Cancel
        </button>
      </form>
    </div>
  )
}
