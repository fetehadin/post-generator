import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { useDeleteCheckin, usePatchCheckin } from '../../api/checkins'
import { useReviseDraft } from '../../api/drafts'
import { useGenerateInThread, useThread } from '../../api/threads'
import type { DraftRow, GenerateFailure, Platform, Thread, ThreadMessage } from '../../api/types'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { Icon } from '../../components/Icon'
import { PlatformMark } from '../../components/PlatformMark'
import { savedPlatforms, savePlatforms } from '../../lib/platformChoice'
import { LABEL, PLATFORMS } from '../../lib/platforms'
import { slowNote, useElapsed } from '../../lib/useElapsed'
import { cn } from '../../lib/utils'
import { DraftCard, FoldedCard } from './DraftCard'

const QUICK = ['Shorter', 'Punchier', 'More casual', 'Add a hook']
const TAB_BAR = 64 // the mobile tab bar under the composer, in px

/**
 * One chat (DESIGN.md §4.1, FR-10, FR-40, FR-46): the day's check-in, then a card for every
 * draft version in order; the newest card of each draft is open, older ones fold. Reply to a
 * card from the box at the bottom; every reply that changes the text adds a new card.
 */
export function ThreadPage() {
  const { id } = useParams()
  const thread = useThread(id)
  return thread.isPending ? (
    <p className="mx-auto max-w-column px-4 py-16 text-muted md:px-6">Loading the chat…</p>
  ) : thread.isError ? (
    <p role="alert" className="mx-auto max-w-column px-4 py-16 text-danger md:px-6">
      {thread.error.message}{' '}
      <Link to="/" className="text-thread underline underline-offset-4">
        Start a new chat
      </Link>
    </p>
  ) : (
    <ThreadView key={thread.data.id} thread={thread.data} />
  )
}

/** Who the box replies to: a draft, nobody (the user closed it), or automatic. */
type ReplyTo = string | null | 'auto'

function ThreadView({ thread }: { thread: Thread }) {
  const location = useLocation()
  const navigate = useNavigate()
  const live = thread.drafts.filter((d) => d.status !== 'discarded')
  const [replyTo, setReplyTo] = useState<ReplyTo>('auto')
  const [picking, setPicking] = useState(false)
  const [selection, setSelection] = useState('')
  const [revising, setRevising] = useState<DraftRow | null>(null)
  const [announce, setAnnounce] = useState('')
  const composer = useRef<HTMLDivElement>(null)
  // With one draft in the thread, replies go to it (§4.1) until the user closes the box.
  const selected =
    replyTo === 'auto'
      ? live.length === 1
        ? live[0]
        : null
      : (thread.drafts.find((d) => d.id === replyTo) ?? null)

  // Arriving with intent (Generate, a notification, /drafts/:id): apply it once, then clear
  // it from history so a reload or Back doesn't ask again.
  useEffect(() => {
    const state = location.state as { ask?: boolean; draft?: string } | null
    if (!state) return
    if (state.ask) setPicking(true)
    if (state.draft) {
      setReplyTo(state.draft)
      const card = document.getElementById(`card-${state.draft}`)
      card?.scrollIntoView?.()
      card?.focus()
    }
    navigate(location.pathname, { replace: true, state: null })
  }, [location.key]) // eslint-disable-line react-hooks/exhaustive-deps

  // "Draft ready" for screen readers when new drafts arrive (§7).
  const count = thread.drafts.length
  const previous = useRef(count)
  useEffect(() => {
    const added = count - previous.current
    previous.current = count
    if (added > 0) setAnnounce(added === 1 ? 'Draft ready.' : `${added} drafts ready.`)
  }, [count])

  // Bars never hide focus (WCAG 2.4.11): the page scrolls with room for the composer.
  useLayoutEffect(() => {
    const el = composer.current
    if (!el) return
    const root = document.documentElement
    const update = () => {
      const below = matchMedia('(min-width: 768px)').matches ? 0 : TAB_BAR
      root.style.scrollPaddingBottom = `${el.offsetHeight + below + 16}px`
    }
    update()
    const watch = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update)
    watch?.observe(el)
    return () => {
      watch?.disconnect()
      root.style.scrollPaddingBottom = ''
    }
  }, [])

  const byId = new Map(thread.drafts.map((d) => [d.id, d]))
  // The chat opens with the day's check-in; it can be edited or deleted there (FR-6).
  const checkinMessage = thread.messages.find((m) => m.role === 'user' && !m.draft_id)
  const newest = new Map<string, string>()
  for (const m of thread.messages) if (m.card && m.draft_id) newest.set(m.draft_id, m.id)

  return (
    <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-column flex-col px-4 pt-12 md:min-h-screen md:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">{thread.title}</h1>
      <p aria-live="polite" className="sr-only">
        {announce}
      </p>
      <ol className="mt-8 flex flex-col gap-4 pb-8">
        {thread.messages.map((m) => {
          const draft = m.draft_id ? byId.get(m.draft_id) : undefined
          const isNewest = Boolean(m.card && draft && newest.get(draft.id) === m.id)
          return (
            <li key={m.id} id={isNewest ? `card-${draft!.id}` : undefined} tabIndex={-1}>
              {m.card && draft ? (
                isNewest ? (
                  <DraftCard
                    card={m.card}
                    draft={draft}
                    selected={selected?.id === draft.id}
                    onSelect={() => {
                      setReplyTo(selected?.id === draft.id ? null : draft.id)
                      setSelection('')
                    }}
                    onSelectText={(t) => {
                      setReplyTo(draft.id)
                      setSelection(t)
                    }}
                  />
                ) : (
                  <FoldedCard card={m.card} draft={draft} />
                )
              ) : m === checkinMessage ? (
                thread.checkin_id ? (
                  <CheckinMessage checkinId={thread.checkin_id} text={thread.checkin_text} />
                ) : (
                  <p className="ml-auto text-sm text-muted">You deleted this check-in.</p>
                )
              ) : (
                <Plain message={m} />
              )}
            </li>
          )
        })}
        {revising && (
          <li
            aria-live="polite"
            className="rounded-panel border border-dashed border-edge p-4 text-sm font-semibold"
          >
            <span className="flex items-center gap-2">
              <PlatformMark platform={revising.platform} />
              Writing the next version of your {LABEL[revising.platform]} draft…
            </span>
          </li>
        )}
      </ol>
      <div
        ref={composer}
        className="sticky bottom-16 mt-auto border-t border-line bg-paper py-3 md:bottom-0"
      >
        {picking ? (
          <PlatformPicker
            thread={thread}
            canClose
            onClose={() => setPicking(false)}
            onDone={() => setPicking(false)}
          />
        ) : selected ? (
          <ReplyBox
            key={selected.id}
            draft={selected}
            selection={selection}
            onBusy={(busy) => setRevising(busy ? selected : null)}
            onClearSelection={() => setSelection('')}
            onClear={() => {
              setReplyTo(null)
              setSelection('')
            }}
            onMorePlatforms={() => setPicking(true)}
          />
        ) : (
          <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
            {count === 0 ? 'Saved as today’s check-in.' : 'Press Reply on a card to change it.'}
            <button
              type="button"
              onClick={() => setPicking(true)}
              className={cn(
                'ml-auto min-h-10 rounded-control px-3',
                count === 0
                  ? 'bg-primary font-semibold text-on-primary'
                  : 'text-thread underline underline-offset-4',
              )}
            >
              {count === 0 ? 'Write drafts from it' : 'Write for other platforms'}
            </button>
          </p>
        )}
      </div>
    </div>
  )
}

/**
 * The day's check-in (FR-6): edit it, or delete it. Drafts already made from it stay; new
 * drafts use the edited text.
 */
function CheckinMessage({ checkinId, text }: { checkinId: string; text: string }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(text)
  const patch = usePatchCheckin()
  const remove = useDeleteCheckin()
  const boxId = useId()
  const error = patch.error
  return (
    <div className="ml-auto max-w-[85%]">
      {editing ? (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (value.trim())
              patch.mutate({ id: checkinId, text: value }, { onSuccess: () => setEditing(false) })
          }}
        >
          <label htmlFor={boxId} className="mb-1 block text-right text-sm font-semibold">
            Check-in text
          </label>
          <textarea
            id={boxId}
            value={value}
            maxLength={4000}
            onChange={(e) => setValue(e.target.value)}
            className="block w-full rounded-panel border border-edge bg-surface px-4 py-3 font-serif text-lg leading-writing [field-sizing:content]"
          />
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="min-h-9 rounded-control border border-edge px-3 text-sm hover:bg-sunken"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={patch.isPending || !value.trim()}
              className="min-h-9 rounded-control bg-primary px-3 text-sm font-semibold text-on-primary disabled:opacity-50"
            >
              Save check-in
            </button>
          </div>
        </form>
      ) : (
        <>
          <p className="rounded-panel bg-sunken px-4 py-3 font-serif text-lg leading-writing whitespace-pre-wrap">
            <span className="sr-only">Your check-in: </span>
            {text}
          </p>
          <p className="mt-1 flex justify-end gap-1 text-sm">
            <button
              type="button"
              onClick={() => {
                setValue(text)
                setEditing(true)
              }}
              className="min-h-9 px-2 text-muted hover:text-ink"
            >
              Edit check-in
            </button>
            <ConfirmDialog
              trigger="Delete check-in"
              triggerClassName="min-h-9 rounded-control px-2 text-muted hover:bg-sunken hover:text-danger"
              title="Delete this check-in?"
              description="The drafts made from it stay in this chat. This can't be undone."
              confirm="Delete check-in"
              busy={remove.isPending}
              error={remove.error?.message}
              onConfirm={() => remove.mutate(checkinId)}
            />
          </p>
        </>
      )}
      {error && (
        <p role="alert" className="mt-1 text-right text-sm text-danger">
          {error.message}
        </p>
      )}
    </div>
  )
}

function Plain({ message }: { message: ThreadMessage }) {
  if (!message.text) return null
  return message.role === 'user' ? (
    <p className="ml-auto max-w-[85%] rounded-panel bg-sunken px-4 py-3 font-serif text-lg leading-writing whitespace-pre-wrap">
      <span className="sr-only">You: </span>
      {message.text}
    </p>
  ) : (
    <p className="text-muted">{message.text}</p>
  )
}

/** "Which platforms?" (§4.1): three toggles, remembering the last choice, then one card each. */
function PlatformPicker({
  thread,
  canClose,
  onClose,
  onDone,
}: {
  thread: Thread
  canClose: boolean
  onClose: () => void
  onDone: () => void
}) {
  const [chosen, setChosen] = useState<Platform[]>(savedPlatforms)
  const [failures, setFailures] = useState<GenerateFailure[]>([])
  const generate = useGenerateInThread()
  const seconds = useElapsed(generate.isPending)
  const n = chosen.length
  const retrying = failures.length > 0

  function toggle(p: Platform) {
    setChosen((c) => (c.includes(p) ? c.filter((x) => x !== p) : [...c, p]))
  }

  function write(platforms: Platform[]) {
    if (!platforms.length || generate.isPending) return
    if (!retrying) savePlatforms(platforms)
    generate.mutate(
      { threadId: thread.id, platforms },
      {
        onSuccess: (t) => {
          const failed = t.failures ?? []
          setFailures(failed)
          // Only what failed is offered again, so a retry never duplicates a draft.
          if (failed.length) setChosen(failed.map((f) => f.platform))
          else onDone()
        },
      },
    )
  }

  return (
    <div>
      {generate.isPending && (
        <ul aria-live="polite" className="mb-3 flex flex-col gap-2">
          {chosen.map((p) => (
            <li key={p} className="rounded-panel border border-dashed border-edge p-4 text-sm">
              <span className="flex items-center gap-2 font-semibold">
                <PlatformMark platform={p} />
                Writing your {LABEL[p]} draft…
              </span>
              {slowNote(seconds) && (
                <span className="mt-1 block text-muted">{slowNote(seconds)}</span>
              )}
            </li>
          ))}
        </ul>
      )}
      {failures.map((f) => (
        <p key={f.platform} role="alert" className="mb-2 text-sm text-danger">
          {LABEL[f.platform]}: {f.message}
        </p>
      ))}
      {generate.error && (
        <p role="alert" className="mb-2 text-sm text-danger">
          {generate.error.message} Your check-in is saved.
        </p>
      )}
      <div
        role="group"
        aria-labelledby="which-platforms"
        className="flex flex-wrap items-center gap-2"
      >
        <p id="which-platforms" className="mr-1 text-sm font-semibold">
          Which platforms?
        </p>
        {PLATFORMS.map((p) => {
          const on = chosen.includes(p)
          return (
            <button
              key={p}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(p)}
              className={cn(
                'flex min-h-10 items-center gap-2 rounded-full border px-3 text-sm',
                on ? 'border-primary bg-primary text-on-primary' : 'border-edge hover:bg-sunken',
              )}
            >
              {on ? <Icon name="check" className="size-4" /> : <PlatformMark platform={p} />}
              {LABEL[p]}
            </button>
          )
        })}
        <div className="ml-auto flex gap-2">
          {canClose && (
            <button
              type="button"
              onClick={onClose}
              className="min-h-10 rounded-control border border-edge px-3 text-sm hover:bg-sunken"
            >
              Cancel
            </button>
          )}
          <button
            type="button"
            disabled={n === 0 || generate.isPending}
            onClick={() => write(chosen)}
            className="min-h-10 rounded-control bg-primary px-4 text-sm font-semibold text-on-primary disabled:opacity-50"
          >
            {retrying || generate.error
              ? 'Try again'
              : n === 1
                ? 'Write 1 draft'
                : `Write ${n} drafts`}
          </button>
        </div>
      </div>
    </div>
  )
}

/** "Replying to: X draft" (§4.1): quick changes, or tell it what to change. */
function ReplyBox({
  draft,
  selection,
  onBusy,
  onClearSelection,
  onClear,
  onMorePlatforms,
}: {
  draft: DraftRow
  selection: string
  onBusy: (busy: boolean) => void
  onClearSelection: () => void
  onClear: () => void
  onMorePlatforms: () => void
}) {
  const [text, setText] = useState('')
  const [last, setLast] = useState('')
  const revise = useReviseDraft(draft.id)
  const seconds = useElapsed(revise.isPending)
  const boxId = useId()
  const name = LABEL[draft.platform]
  const busy = revise.isPending || draft.status === 'published'

  function send(instruction: string) {
    // The keyboard shortcut obeys the same rules as the buttons.
    if (busy || !instruction.trim()) return
    setLast(instruction.trim())
    onBusy(true)
    revise.mutate(
      { instruction: instruction.trim(), ...(selection && { selection }) },
      {
        onSuccess: () => {
          setText('')
          onClearSelection()
        },
        onSettled: () => onBusy(false),
      },
    )
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="flex items-center gap-2 rounded-full bg-sunken py-1 pr-1 pl-3">
          Replying to: {name} draft
          <button
            type="button"
            onClick={onClear}
            aria-label="Stop replying to this draft"
            className="grid size-7 place-items-center rounded-full hover:bg-line"
          >
            <Icon name="x" className="size-4" />
          </button>
        </span>
        {selection && (
          <span className="flex max-w-full items-center gap-2 rounded-full border border-edge py-1 pr-1 pl-3">
            <span className="truncate">Only this part: “{selection}”</span>
            <button
              type="button"
              onClick={onClearSelection}
              aria-label="Change the whole draft instead"
              className="grid size-7 flex-none place-items-center rounded-full hover:bg-sunken"
            >
              <Icon name="x" className="size-4" />
            </button>
          </span>
        )}
        <button
          type="button"
          onClick={onMorePlatforms}
          className="ml-auto min-h-9 rounded-control px-2 text-thread underline underline-offset-4"
        >
          Write for other platforms
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {QUICK.map((q) => (
          <button
            key={q}
            type="button"
            disabled={busy}
            onClick={() => send(q)}
            className="min-h-9 rounded-full border border-edge px-3 text-sm hover:bg-sunken disabled:opacity-50"
          >
            {q}
          </button>
        ))}
      </div>
      <form
        className="mt-2 flex items-end gap-2 rounded-panel border border-edge bg-surface p-2 pl-3 focus-within:outline-2 focus-within:outline-thread"
        onSubmit={(e) => {
          e.preventDefault()
          send(text)
        }}
      >
        <label htmlFor={boxId} className="sr-only">
          Tell it what to change in the {name} draft
        </label>
        <textarea
          id={boxId}
          value={text}
          rows={1}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send(text)
          }}
          placeholder="Tell it what to change… e.g. mention the 31 skipped posts"
          className="max-h-40 min-h-10 flex-1 resize-none bg-transparent py-2 outline-none [field-sizing:content] placeholder:text-muted"
        />
        <button
          type="submit"
          disabled={busy || !text.trim()}
          title="Ctrl+Enter"
          className="min-h-10 rounded-control bg-primary px-4 text-sm font-semibold text-on-primary disabled:opacity-50"
        >
          Send
        </button>
      </form>
      {revise.isPending && slowNote(seconds) && (
        <p className="mt-1 text-sm text-muted">{slowNote(seconds)}</p>
      )}
      {draft.status === 'published' && (
        <p className="mt-1 text-sm text-muted">This draft is posted; it can't be changed.</p>
      )}
      {revise.error && (
        <p role="alert" className="mt-1 flex flex-wrap items-center gap-2 text-sm text-danger">
          {revise.error.message} Your text is still here.
          <button
            type="button"
            onClick={() => send(text || last)}
            className="min-h-9 rounded-control border border-edge px-3 text-ink hover:bg-sunken"
          >
            Try again
          </button>
        </p>
      )}
    </div>
  )
}
