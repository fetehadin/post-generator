import { useEffect, useRef, useState } from 'react'
import { usePatchAnyDraft, useRestoreVersion } from '../../api/drafts'
import { useMe, useZone } from '../../api/me'
import { usePlatform } from '../../api/platforms'
import { usePublishDraft, useTelegram } from '../../api/telegram'
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
import { Tooltip } from '../../components/ui/tooltip'
import { copyText, handOff, handOffLabel } from '../../lib/handoff'
import { LABEL, PLATFORMS, RULES, STATUS_LABEL } from '../../lib/platforms'
import { dateIn, formatShort, formatWhen, localToUtc } from '../../lib/time'
import { chip, ghost, iconButton, primary, secondary } from '../../lib/ui'
import { cn } from '../../lib/utils'
import { Preview } from '../Editor/Preview'
import { useReveal } from './AiStatus'

/** One-click changes under a draft (DESIGN.md §1.4): sent as the instruction, like a reply. */
export const QUICK = ['Shorter', 'Punchier', 'More casual', 'Add a hook']
export const AGAIN = 'Write another version with the same facts and fresh wording.'
const LANGUAGES = ['English', 'Amharic', 'French', 'Spanish', 'Arabic', 'German']
export const translate = (lang: string) =>
  `Translate it into ${lang}. Keep the meaning, the tone and about the same length.`

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
        {!open && <span className="min-w-0 truncate">{firstLine}</span>}
        <Icon name={open ? 'chevron-down' : 'chevron-right'} className="ml-auto size-4" />
      </button>
      {open && (
        <div className="px-4 pb-3">
          <p className="text-md leading-writing whitespace-pre-wrap text-ink">{card.text}</p>
          {draft.status !== 'published' && (
            <button
              type="button"
              disabled={restore.isPending}
              onClick={() => restore.mutate(card.version_id)}
              className={cn(secondary, 'mt-2 min-h-9')}
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
 * The newest version of a draft (DESIGN.md §4.1, FR-9, FR-10, FR-11): the text, the length
 * counter and "AI draft". Changes are one click away under the text; Undo goes back a
 * version. One primary action: Approve (it asks only for the day, FR-45), then, once
 * approved, the hand-off (nothing leaves before approval, rule 4).
 */
export function DraftCard({
  card,
  draft,
  previous,
  fresh = false,
  busy = false,
  onRevise,
  onSelectText,
}: {
  card: ThreadCard
  draft: DraftRow
  /** The version before this one, for Undo. */
  previous?: ThreadCard
  /** Just written: the text arrives with a short reveal. */
  fresh?: boolean
  /** A change is being written for this draft. */
  busy?: boolean
  onRevise: (instruction: string) => void
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
  const restore = useRestoreVersion(draft.id)
  const label = `${LABEL[draft.platform]} draft`
  const textRef = useRef<HTMLParagraphElement>(null)
  const reveal = useReveal(card.text, fresh)
  const editable = draft.status === 'draft' || draft.status === 'approved'

  // A selection inside the draft scopes the next change (§4.1); mouse, keyboard or touch.
  useEffect(() => {
    function changed() {
      const sel = window.getSelection()
      const el = textRef.current
      if (!sel || !el || sel.isCollapsed || !el.contains(sel.anchorNode)) return
      const text = sel.toString().trim()
      if (text && card.text.includes(text)) onSelectText(text)
    }
    document.addEventListener('selectionchange', changed)
    return () => document.removeEventListener('selectionchange', changed)
  }, [card.text, onSelectText])
  const over = card.length.over
  const error = patch.error ?? schedule.error ?? convert.error ?? restore.error

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
            ? 'Copied. Open your channel in Telegram and paste it. Add the channel name in Profile → Connections.'
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
      aria-label={`${label}, version ${card.number}`}
      className="rounded-panel border border-line bg-surface p-5"
    >
      <header className="flex items-center gap-2 text-sm">
        <PlatformMark platform={draft.platform} />
        <span className="min-w-0 truncate font-semibold">
          {LABEL[draft.platform]}
          <span className="max-sm:sr-only"> draft</span>
        </span>
        {card.number > 1 && <span className="text-muted">v{card.number}</span>}
        {draft.status !== 'draft' && (
          <span className="rounded-full bg-sunken px-2 py-0.5 text-xs text-muted max-sm:hidden">
            {STATUS_LABEL[draft.status]}
          </span>
        )}
        <div className="ml-auto flex items-center gap-0.5">
          <Tooltip
            content={mode === 'preview' ? 'Show the text' : 'Preview on ' + LABEL[draft.platform]}
          >
            <button
              type="button"
              aria-label="Preview"
              aria-pressed={mode === 'preview'}
              onClick={() => setMode(mode === 'preview' ? 'read' : 'preview')}
              className={cn(iconButton, mode === 'preview' && 'bg-sunken text-ink')}
            >
              <Icon name="eye" />
            </button>
          </Tooltip>
          {editable && (
            <Tooltip content="Edit by hand">
              <button
                type="button"
                aria-label="Edit by hand"
                aria-pressed={mode === 'edit'}
                onClick={() => {
                  setEdited(card.text)
                  setMode(mode === 'edit' ? 'read' : 'edit')
                }}
                className={cn(iconButton, mode === 'edit' && 'bg-sunken text-ink')}
              >
                <Icon name="pencil" />
              </button>
            </Tooltip>
          )}
          <DropdownMenu>
            <Tooltip content="More">
              <DropdownMenuTrigger aria-label={`More for the ${label}`} className={iconButton}>
                <Icon name="more" />
              </DropdownMenuTrigger>
            </Tooltip>
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
              {draft.status !== 'published' && <DropdownMenuSeparator />}
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
            Edit the {label}
          </label>
          <textarea
            id={`edit-${draft.id}`}
            value={edited}
            onChange={(e) => setEdited(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setMode('read')}
            className="block w-full resize-y rounded-control border border-edge bg-surface p-3 text-md leading-writing [field-sizing:content]"
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <LengthCounter text={edited} rule={RULES[draft.platform]} limit={card.length.limit} />
            <button type="button" onClick={() => setMode('read')} className={cn(ghost, 'ml-auto')}>
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
        <p
          ref={textRef}
          aria-busy={!reveal.done}
          className={cn(
            'mt-3 text-md leading-writing whitespace-pre-wrap transition-opacity duration-(--duration)',
            busy && 'opacity-50',
          )}
        >
          {reveal.text}
        </p>
      )}

      <footer className="mt-3 flex flex-wrap items-center gap-3 text-xs">
        {mode !== 'edit' && (
          <LengthCounter text={card.text} rule={RULES[draft.platform]} limit={card.length.limit} />
        )}
        <span className="inline-flex items-center gap-1 text-thread">
          <Icon name="nib" className="size-3.5" />
          AI draft
        </span>
      </footer>

      {editable && mode !== 'edit' && (
        <div role="group" aria-label="Quick changes" className="mt-4 flex flex-wrap gap-1.5">
          {QUICK.map((q) => (
            <button
              key={q}
              type="button"
              disabled={busy}
              onClick={() => onRevise(q)}
              className={cn(chip, 'text-muted hover:text-ink')}
            >
              {q}
            </button>
          ))}
          <DropdownMenu>
            <DropdownMenuTrigger disabled={busy} className={cn(chip, 'text-muted hover:text-ink')}>
              <Icon name="globe" className="size-4" />
              Translate
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {LANGUAGES.map((lang) => (
                <DropdownMenuItem key={lang} onSelect={() => onRevise(translate(lang))}>
                  {lang}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <button
            type="button"
            disabled={busy}
            onClick={() => onRevise(AGAIN)}
            className={cn(chip, 'text-muted hover:text-ink')}
          >
            <Icon name="refresh" className="size-4" />
            Another version
          </button>
          {previous && (
            <Tooltip content={`Back to v${previous.number}`}>
              <button
                type="button"
                disabled={busy || restore.isPending}
                onClick={() => restore.mutate(previous.version_id)}
                className={cn(chip, 'text-muted hover:text-ink')}
              >
                <Icon name="undo" className="size-4" />
                Undo
              </button>
            </Tooltip>
          )}
        </div>
      )}

      <Status
        draft={draft}
        text={card.text}
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
        onNote={setNote}
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
  text,
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
  onNote,
}: {
  draft: DraftRow
  text: string
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
  onNote: (note: string) => void
}) {
  if (draft.status === 'published')
    return (
      <p className="mt-4 text-sm text-muted">
        Posted{draft.published_at ? ` ${formatWhen(draft.published_at, zone)}` : ''}.
      </p>
    )
  if (draft.status === 'discarded')
    return <p className="mt-4 text-sm text-muted">Discarded. Restore it from the ⋯ menu.</p>

  if (draft.status === 'draft')
    return (
      <div className="mt-4 border-t border-line pt-4">
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
          <div className="mt-3">
            <DayChips timeZone={zone} busy={busy} onPick={(day) => onPick(day)} />
            <button type="button" onClick={onCancel} className={cn(ghost, 'mt-2')}>
              Cancel
            </button>
          </div>
        )}
      </div>
    )

  // Approved: on the calendar at the picked hour, with why, and the hand-off.
  return (
    <Approved
      draft={draft}
      text={text}
      zone={zone}
      picked={picked}
      over={over}
      mode={mode}
      channel={channel}
      busy={busy}
      onChangeTime={onChangeTime}
      onPick={onPick}
      onPost={onPost}
      onCancel={onCancel}
      onNote={onNote}
    />
  )
}

/**
 * An approved draft: when it's planned, and how it leaves. With the Telegram bot connected
 * (FR-36), "Post to Telegram now" sends it to the channel on this click (rule 4); otherwise
 * the hand-off copies the text and opens the platform (FR-12).
 */
function Approved({
  draft,
  text,
  zone,
  picked,
  over,
  mode,
  channel,
  busy,
  onChangeTime,
  onPick,
  onPost,
  onCancel,
  onNote,
}: {
  draft: DraftRow
  text: string
  zone?: string
  picked: ScheduleResult | null
  over: boolean
  mode: string
  channel?: string | null
  busy: boolean
  onChangeTime: () => void
  onPick: (day: string, at?: string) => void
  onPost: () => void
  onCancel: () => void
  onNote: (note: string) => void
}) {
  const bot = useTelegram().data
  const publish = usePublishDraft()
  const viaBot = draft.platform === 'telegram' && Boolean(bot?.channel?.can_post)
  return (
    <div className="mt-4 border-t border-line pt-4 text-sm">
      {draft.scheduled_for &&
        (Date.parse(draft.scheduled_for) < Date.now() - 30 * 60_000 ? (
          <p className="text-danger">
            {formatShort(draft.scheduled_for, zone)} passed. Post now or pick another time.
          </p>
        ) : (
          <p>
            <span className="font-semibold">On your calendar</span>{' '}
            {formatWhen(draft.scheduled_for, zone)} your time
            {picked && <span className="block text-muted">{picked.reason}</span>}
          </p>
        ))}
      {picked?.warning && <p className="mt-1 text-signal">{picked.warning}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {viaBot ? (
          <button
            type="button"
            disabled={over || publish.isPending}
            onClick={() => publish.mutate(draft.id)}
            className={primary}
          >
            {publish.isPending ? 'Posting…' : 'Post to Telegram now'}
          </button>
        ) : (
          <button type="button" disabled={over} onClick={onPost} className={primary}>
            {handOffLabel(draft.platform, channel)}
          </button>
        )}
        {/* Only when the main button also opens a site; else it already just copies. */}
        {(viaBot || !handOffLabel(draft.platform, channel).startsWith('Copy text')) && (
          <Tooltip content="Copy the text only">
            <button
              type="button"
              aria-label="Copy text"
              disabled={over}
              onClick={async () =>
                onNote((await copyText(text)) ? 'Copied.' : "Couldn't copy: select the text.")
              }
              className={iconButton}
            >
              <Icon name="copy" />
            </button>
          </Tooltip>
        )}
        <button
          type="button"
          aria-expanded={mode === 'time'}
          onClick={onChangeTime}
          className={ghost}
        >
          Change time
        </button>
      </div>
      {viaBot && bot?.channel && !publish.error && (
        <p className="mt-2 text-muted">Posts to {bot.channel.title} when you tap it.</p>
      )}
      {publish.error && (
        <p role="alert" className="mt-2 text-danger">
          {publish.error.message}
        </p>
      )}
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
    <div className="mt-3">
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
          className="min-h-10 rounded-control border border-edge bg-surface px-2 text-sm"
        />
        <button type="submit" disabled={busy || !time} className={secondary}>
          Use this time
        </button>
        <button type="button" onClick={onCancel} className={ghost}>
          Cancel
        </button>
      </form>
    </div>
  )
}
