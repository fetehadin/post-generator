import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { activeKey, useAIKeys } from '../../api/aiKeys'
import { useDeleteCheckin, usePatchCheckin } from '../../api/checkins'
import { useReviseAnyDraft } from '../../api/drafts'
import { useGenerateInThread, useThread } from '../../api/threads'
import type {
  DraftRow,
  GenerateFailure,
  GenerateNotice,
  Platform,
  Thread,
  ThreadCard,
  ThreadMessage,
} from '../../api/types'
import { AddKeyNudge } from '../../components/AddKeyNudge'
import { type Command, Composer, PlatformChips } from '../../components/Composer'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { Icon } from '../../components/Icon'
import { PlatformMark } from '../../components/PlatformMark'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs'
import { Tooltip } from '../../components/ui/tooltip'
import { savedPlatforms, savePlatforms } from '../../lib/platformChoice'
import { LABEL, PLATFORMS } from '../../lib/platforms'
import { ghost, iconButton, primary, secondary } from '../../lib/ui'
import { cn } from '../../lib/utils'
import { ManualFallback, WritingCard } from './AiStatus'
import { AGAIN, DraftCard, FoldedCard, QUICK } from './DraftCard'

const TAB_BAR = 64 // the mobile tab bar under the composer, in px

/**
 * One chat as a canvas (DESIGN.md §4.1, FR-10, FR-40, FR-46): the check-in, the history and
 * the message box on one side; the drafts in a panel beside it on wide screens, under the
 * check-in on phones. The panel shows the newest version of each draft, one tab per draft;
 * older versions fold into the history.
 */
export function ThreadPage() {
  const { id } = useParams()
  const thread = useThread(id)
  return thread.isPending ? (
    <ThreadSkeleton />
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

const layout =
  'mx-auto grid min-h-[calc(100vh-4rem)] max-w-[1240px] grid-cols-1 content-start gap-x-10 px-4 md:min-h-screen md:px-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] xl:grid-rows-[auto_1fr_auto]'

/** The loaded layout's frame, so nothing jumps when the chat arrives. */
function ThreadSkeleton() {
  return (
    <div aria-busy="true" className={layout}>
      <p className="sr-only">Loading the chat…</p>
      <div className="flex justify-end pt-10 xl:col-start-1">
        <span className="h-12 w-2/3 rounded-3xl bg-sunken" />
      </div>
      <div className="pt-6 xl:col-start-2 xl:row-span-3 xl:row-start-1 xl:pt-10">
        <div className="rounded-panel border border-line p-5">
          <span className="block h-4 w-24 rounded-full bg-sunken" />
          <div className="mt-5 flex flex-col gap-3">
            {['w-11/12', 'w-full', 'w-3/4', 'w-1/2'].map((w) => (
              <span key={w} className={cn('h-3 rounded-full bg-sunken', w)} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/** What the drafts are doing right now (DESIGN.md §7). */
function useWriter(thread: Thread) {
  const generate = useGenerateInThread()
  const [pending, setPending] = useState<Platform[]>([])
  const [failures, setFailures] = useState<GenerateFailure[]>([])
  const [notices, setNotices] = useState<GenerateNotice[]>([])
  const [stopped, setStopped] = useState(false)
  const abort = useRef<AbortController | null>(null)

  function write(platforms: Platform[]) {
    if (!platforms.length || generate.isPending) return
    setStopped(false)
    setPending(platforms)
    abort.current = new AbortController()
    generate.mutate(
      { threadId: thread.id, platforms, signal: abort.current.signal },
      {
        onSuccess: (t) => {
          // Only what failed is offered again, so a retry never duplicates a draft.
          setFailures(t.failures ?? [])
          setNotices(t.notices ?? [])
        },
        onError: () => {
          if (abort.current?.signal.aborted) setStopped(true)
        },
        onSettled: () => setPending([]),
      },
    )
  }

  return {
    write,
    stop: () => abort.current?.abort(),
    pending,
    failures,
    notices,
    stopped,
    error: stopped ? null : generate.error,
    dismissNotices: () => setNotices([]),
  }
}

type Writer = ReturnType<typeof useWriter>
type Versions = Map<string, Array<{ message: ThreadMessage; card: ThreadCard }>>

function ThreadView({ thread }: { thread: Thread }) {
  const location = useLocation()
  const navigate = useNavigate()
  const live = thread.drafts.filter((d) => d.status !== 'discarded')
  const [active, setActive] = useState<string | null>(live[0]?.id ?? null)
  const [selection, setSelection] = useState('')
  const [announce, setAnnounce] = useState('')
  const writer = useWriter(thread)
  const revise = useReviseFor()
  const composer = useRef<HTMLDivElement>(null)
  const panel = useRef<HTMLElement>(null)
  const current = live.find((d) => d.id === active) ?? live[0] ?? null

  // Arriving with intent (the new-chat box, a notification, /drafts/:id): apply it once, then
  // clear it from history so a reload or Back doesn't do it again.
  useEffect(() => {
    const state = location.state as { draft?: string; write?: Platform[] } | null
    if (!state) return
    if (state.write?.length) writer.write(state.write)
    if (state.draft) {
      setActive(state.draft)
      panel.current?.scrollIntoView?.({ block: 'start' })
    }
    navigate(location.pathname, { replace: true, state: null })
  }, [location.key]) // eslint-disable-line react-hooks/exhaustive-deps

  // New drafts: open the first new one and tell screen readers (§7).
  const ids = live.map((d) => d.id).join()
  const seenIds = useRef(new Set(live.map((d) => d.id)))
  useEffect(() => {
    const added = live.filter((d) => !seenIds.current.has(d.id))
    for (const d of added) seenIds.current.add(d.id)
    if (added.length) {
      setActive(added[0].id)
      setAnnounce(added.length === 1 ? 'Draft ready.' : `${added.length} drafts ready.`)
    }
  }, [ids]) // eslint-disable-line react-hooks/exhaustive-deps

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

  const onSelectText = useCallback((t: string) => setSelection(t), [])
  const byId = new Map(thread.drafts.map((d) => [d.id, d]))
  const checkinMessage = thread.messages.find((m) => m.role === 'user' && !m.draft_id)
  // Every card per draft, oldest first: the last one is in the panel, the rest are history.
  const versions: Versions = new Map()
  for (const m of thread.messages)
    if (m.card && m.draft_id)
      versions.set(m.draft_id, [...(versions.get(m.draft_id) ?? []), { message: m, card: m.card }])
  const newestIds = new Set([...versions.values()].map((v) => v[v.length - 1].message.id))
  const history = thread.messages.filter(
    (m) => m !== checkinMessage && !newestIds.has(m.id) && (m.card || m.text),
  )

  return (
    <div className={layout}>
      <h1 className="sr-only">{thread.title}</h1>
      <p aria-live="polite" className="sr-only">
        {announce}
      </p>

      <div className="pt-10 xl:col-start-1">
        {thread.checkin_id ? (
          <CheckinMessage checkinId={thread.checkin_id} text={thread.checkin_text} />
        ) : (
          <p className="text-right text-sm text-muted">You deleted this check-in.</p>
        )}
      </div>

      <section
        ref={panel}
        aria-label="Drafts"
        className="scroll-mt-4 pt-6 xl:sticky xl:top-0 xl:col-start-2 xl:row-span-3 xl:row-start-1 xl:max-h-screen xl:overflow-y-auto xl:pt-10 xl:pb-10"
      >
        <DraftPanel
          thread={thread}
          live={live}
          current={current}
          versions={versions}
          writer={writer}
          revise={revise}
          onActive={setActive}
          onSelectText={onSelectText}
        />
      </section>

      {history.length > 0 && (
        <section aria-label="History" className="pt-8 xl:col-start-1">
          <h2 className="mb-3 text-xs font-semibold text-muted">History</h2>
          <ol className="flex flex-col gap-3">
            {history.map((m) => {
              const draft = m.draft_id ? byId.get(m.draft_id) : undefined
              return (
                <li key={m.id}>
                  {m.card && draft ? (
                    <FoldedCard card={m.card} draft={draft} />
                  ) : (
                    <Plain message={m} />
                  )}
                </li>
              )
            })}
          </ol>
        </section>
      )}

      <div
        ref={composer}
        className="sticky bottom-16 z-[1] mt-auto bg-paper pt-6 pb-4 md:bottom-0 xl:col-start-1 xl:row-start-3"
      >
        {current && (
          <ReplyBox
            draft={current}
            drafts={live}
            selection={selection}
            revise={revise}
            onClearSelection={() => setSelection('')}
            onTarget={setActive}
          />
        )}
      </div>
    </div>
  )
}

/**
 * The draft panel: an empty state with one action, the drafts as tabs, what is being written,
 * and anything that went wrong, each with a way on.
 */
function DraftPanel({
  thread,
  live,
  current,
  versions,
  writer,
  revise,
  onActive,
  onSelectText,
}: {
  thread: Thread
  live: DraftRow[]
  current: DraftRow | null
  versions: Versions
  writer: Writer
  revise: Reviser
  onActive: (id: string) => void
  onSelectText: (text: string) => void
}) {
  const own = activeKey(useAIKeys().data)
  const missing = PLATFORMS.filter((p) => !live.some((d) => d.platform === p))
  const writing = writer.pending
  // Cards that were here when the chat opened don't replay the reveal.
  const seen = useRef(new Set([...versions.values()].map((v) => v[v.length - 1].message.id)))
  const failed = writer.failures.map((f) => f.platform)
  const nudge = writer.failures.some((f) => f.code === 'daily_limit')
    ? 'limit'
    : writer.failures.some((f) => f.code === 'ai_unavailable')
      ? 'busy'
      : null
  const empty = !live.length && !writing.length && !writer.failures.length

  useEffect(() => {
    const t = setTimeout(() => {
      for (const v of versions.values()) seen.current.add(v[v.length - 1].message.id)
    }, 1500)
    return () => clearTimeout(t)
  })

  return (
    <div className="flex flex-col gap-4">
      {writer.notices.length > 0 && (
        <div role="status" className="flex flex-col gap-1 rounded-panel bg-sunken p-3 text-sm">
          {writer.notices.map((n, i) => (
            <p key={i} className="text-signal">
              {LABEL[n.platform]}: {n.message}
              {/* The backend's OWN_KEY_FAILED notice: one tap to the key settings. */}
              {n.message.startsWith('Your key failed') && (
                <>
                  {' '}
                  <Link to="/profile?tab=ai" className="text-thread underline">
                    Fix key
                  </Link>
                </>
              )}
            </p>
          ))}
          <button type="button" onClick={writer.dismissNotices} className={cn(ghost, 'self-start')}>
            Dismiss
          </button>
        </div>
      )}

      {empty && !writer.stopped && !writer.error && <EmptyPanel onWrite={writer.write} />}

      {live.length > 0 && current && (
        <Tabs value={current.id} onValueChange={onActive}>
          <div className="flex items-center gap-2">
            {live.length > 1 ? (
              <TabsList
                variant="line"
                aria-label="Drafts"
                className="min-w-0 flex-1 justify-start overflow-x-auto"
              >
                {live.map((d, i) => (
                  <TabsTrigger key={d.id} value={d.id} className="flex-none px-3">
                    <PlatformMark platform={d.platform} />
                    {LABEL[d.platform]}
                    {/* Two drafts for one platform: number the later ones. */}
                    {(() => {
                      const n = live.slice(0, i + 1).filter((x) => x.platform === d.platform).length
                      return n > 1 ? ` ${n}` : ''
                    })()}
                  </TabsTrigger>
                ))}
              </TabsList>
            ) : (
              <span className="flex-1" />
            )}
            {missing.length > 0 && (
              <DropdownMenu>
                <Tooltip content="Write for another platform">
                  <DropdownMenuTrigger
                    aria-label="Write for another platform"
                    disabled={writing.length > 0}
                    className={iconButton}
                  >
                    <Icon name="plus" />
                  </DropdownMenuTrigger>
                </Tooltip>
                <DropdownMenuContent align="end">
                  {missing.map((p) => (
                    <DropdownMenuItem key={p} onSelect={() => writer.write([p])}>
                      <PlatformMark platform={p} />
                      Write {p === 'x' ? 'an' : 'a'} {LABEL[p]} draft
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
          {live.map((d) => {
            const v = versions.get(d.id) ?? []
            const newest = v[v.length - 1]
            if (!newest) return null
            return (
              <TabsContent key={d.id} value={d.id} className="mt-3">
                {revise.busyFor === d.id ? (
                  <WritingCard platform={d.platform} revising onStop={revise.stop} />
                ) : (
                  <DraftCard
                    key={newest.message.id}
                    card={newest.card}
                    draft={d}
                    previous={v[v.length - 2]?.card}
                    fresh={!seen.current.has(newest.message.id)}
                    busy={revise.busyFor !== null}
                    onRevise={(instruction) => revise.send(d, instruction)}
                    onSelectText={onSelectText}
                  />
                )}
                {revise.errorFor === d.id && (
                  <p
                    role="alert"
                    className="mt-2 flex flex-wrap items-center gap-2 text-sm text-danger"
                  >
                    {revise.error}
                    <button
                      type="button"
                      onClick={revise.retry}
                      className={cn(secondary, 'min-h-9 text-ink')}
                    >
                      Try again
                    </button>
                  </p>
                )}
                {revise.stoppedFor === d.id && (
                  <p className="mt-2 text-sm text-muted">
                    Stopped. The draft is as it was; if the change finishes anyway, it shows up as a
                    new version.
                  </p>
                )}
              </TabsContent>
            )
          })}
        </Tabs>
      )}

      {writing.map((p) => (
        <WritingCard key={p} platform={p} onStop={writer.stop} />
      ))}

      {writer.stopped && (
        <div className="rounded-panel border border-line p-4 text-sm">
          <p>Stopped. Your check-in is saved; if the drafts finish anyway, they show up here.</p>
          <button
            type="button"
            onClick={() => writer.write(savedPlatforms())}
            className={cn(secondary, 'mt-3')}
          >
            Write drafts again
          </button>
        </div>
      )}

      {writer.error && (
        <div role="alert" className="rounded-panel border border-line p-4 text-sm">
          <p className="text-danger">{writer.error.message} Your check-in is saved.</p>
          <button
            type="button"
            onClick={() => writer.write(savedPlatforms())}
            className={cn(secondary, 'mt-3')}
          >
            Try again
          </button>
        </div>
      )}

      {writer.failures.length > 0 && !writing.length && (
        <div className="flex flex-col gap-3 rounded-panel border border-line p-4">
          {writer.failures.map((f) => (
            <p key={f.platform} role="alert" className="flex items-start gap-2 text-sm">
              <PlatformMark platform={f.platform} />
              <span className="text-danger">
                {LABEL[f.platform]}: {f.message}
              </span>
            </p>
          ))}
          {nudge && (
            // Saving a key writes the drafts that failed straight away: no extra tap.
            <AddKeyNudge reason={nudge} onSaved={() => writer.write(failed)} />
          )}
          <button
            type="button"
            onClick={() => writer.write(failed)}
            className={cn(secondary, 'self-start')}
          >
            {failed.length === 1 ? `Try ${LABEL[failed[0]]} again` : 'Try again'}
          </button>
          {nudge === 'busy' && <ManualFallback checkin={thread.checkin_text} />}
        </div>
      )}

      {own?.provider && live.length > 0 && (
        <p className="inline-flex items-center gap-1 self-start rounded-full bg-sunken px-3 py-1 text-xs text-muted">
          <Icon name="check" className="size-3" />
          Using your {own.provider.name.replace(/ \(.*\)$/, '')} key
        </p>
      )}
    </div>
  )
}

/**
 * No drafts yet (an NN/g empty state): what appears here, how to start, one action. Shown
 * after "Save as a check-in" or once every draft is discarded.
 */
function EmptyPanel({ onWrite }: { onWrite: (p: Platform[]) => void }) {
  const [platforms, setPlatforms] = useState<Platform[]>(savedPlatforms)
  return (
    <div className="rounded-panel border border-dashed border-edge p-6">
      <p className="flex items-center gap-2 font-semibold">
        <Icon name="nib" className="size-4 text-thread" />
        Your drafts appear here
      </p>
      <p className="mt-1 text-sm text-muted">
        Pick where you post. Each draft can be changed with one click after.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <PlatformChips value={platforms} onChange={setPlatforms} />
        <button
          type="button"
          disabled={!platforms.length}
          onClick={() => {
            savePlatforms(platforms)
            onWrite(platforms)
          }}
          className={cn(primary, 'ml-auto')}
        >
          Write drafts
        </button>
      </div>
    </div>
  )
}

/**
 * A change being written for one draft, with Stop. The card's chips and the message box
 * share it, so the card shows "Rewriting…" whichever started it.
 */
function useReviseFor() {
  const [busyFor, setBusyFor] = useState<string | null>(null)
  const [errorFor, setErrorFor] = useState<string | null>(null)
  const [stoppedFor, setStoppedFor] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [last, setLast] = useState<{ draft: DraftRow; instruction: string; selection?: string }>()
  const revise = useReviseAnyDraft()
  const abort = useRef<AbortController | null>(null)

  function send(draft: DraftRow, instruction: string, selection?: string, done?: () => void) {
    if (busyFor || !instruction.trim() || draft.status === 'published') return
    setLast({ draft, instruction, selection })
    setBusyFor(draft.id)
    setErrorFor(null)
    setStoppedFor(null)
    abort.current = new AbortController()
    revise.mutate(
      {
        id: draft.id,
        instruction: instruction.trim(),
        ...(selection && { selection }),
        signal: abort.current.signal,
      },
      {
        onSuccess: () => done?.(),
        onError: (e) => {
          if (abort.current?.signal.aborted) setStoppedFor(draft.id)
          else {
            setError(`${e.message} Your text is still here.`)
            setErrorFor(draft.id)
          }
        },
        onSettled: () => setBusyFor(null),
      },
    )
  }
  return {
    send,
    busyFor,
    errorFor,
    stoppedFor,
    error,
    stop: () => abort.current?.abort(),
    retry: () => last && send(last.draft, last.instruction, last.selection),
  }
}

type Reviser = ReturnType<typeof useReviseFor>

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
    <div className="group ml-auto max-w-[85%]">
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
            className="block w-full rounded-panel border border-edge bg-surface px-4 py-3 text-md leading-writing [field-sizing:content]"
          />
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" onClick={() => setEditing(false)} className={ghost}>
              Cancel
            </button>
            <button type="submit" disabled={patch.isPending || !value.trim()} className={primary}>
              Save check-in
            </button>
          </div>
        </form>
      ) : (
        <>
          <p className="rounded-3xl bg-bubble px-5 py-2.5 text-md leading-writing whitespace-pre-wrap">
            <span className="sr-only">Your check-in: </span>
            {text}
          </p>
          {/* Quiet until hovered or focused, like a chat app's message actions. */}
          <p className="mt-1 flex justify-end gap-1 text-sm transition-opacity duration-(--duration) md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100">
            <button
              type="button"
              onClick={() => {
                setValue(text)
                setEditing(true)
              }}
              className={cn(ghost, 'min-h-8')}
            >
              Edit check-in
            </button>
            <ConfirmDialog
              trigger="Delete check-in"
              triggerClassName={cn(ghost, 'min-h-8 hover:text-danger')}
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
    <p className="ml-auto max-w-[85%] rounded-3xl bg-bubble px-5 py-2.5 text-md leading-writing whitespace-pre-wrap">
      <span className="sr-only">You: </span>
      {message.text}
    </p>
  ) : (
    <p className="text-sm text-muted">{message.text}</p>
  )
}

/**
 * "Tell it what to change" (§4.1): goes to the draft open in the panel. A sentence selected
 * in the draft scopes the change to it. "/" lists the quick changes and switches drafts.
 */
function ReplyBox({
  draft,
  drafts,
  selection,
  revise,
  onClearSelection,
  onTarget,
}: {
  draft: DraftRow
  drafts: DraftRow[]
  selection: string
  revise: Reviser
  onClearSelection: () => void
  onTarget: (id: string) => void
}) {
  const [text, setText] = useState('')
  const boxId = useId()
  const name = LABEL[draft.platform]
  const posted = draft.status === 'published'
  const busy = revise.busyFor !== null

  function send(instruction: string) {
    revise.send(draft, instruction, selection || undefined, () => {
      setText('')
      onClearSelection()
    })
  }

  const commands: Command[] = [
    ...QUICK.map((q) => ({
      name: q
        .toLowerCase()
        .replace(/^more /, '')
        .replace(/^add a /, ''),
      hint: q,
      run: () => send(q),
    })),
    { name: 'again', hint: 'Another version', run: () => send(AGAIN) },
    ...drafts
      .filter((d) => d.id !== draft.id)
      .map((d) => ({
        name: d.platform,
        hint: `Change the ${LABEL[d.platform]} draft instead`,
        run: () => onTarget(d.id),
      })),
  ]

  return (
    <div>
      {selection && (
        <p className="mb-2 flex max-w-full items-center gap-2 text-sm">
          <span className="flex min-w-0 items-center gap-2 rounded-full bg-sunken py-1 pr-1 pl-3">
            <span className="truncate">Only this part: “{selection}”</span>
            <button
              type="button"
              onClick={onClearSelection}
              aria-label="Change the whole draft instead"
              className="grid size-7 flex-none place-items-center rounded-full hover:bg-line"
              data-compact
            >
              <Icon name="x" className="size-4" />
            </button>
          </span>
        </p>
      )}
      <Composer
        id={boxId}
        label={`Tell it what to change in the ${name} draft`}
        value={text}
        onChange={setText}
        onSubmit={() => send(text)}
        canSubmit={Boolean(text.trim()) && !posted}
        busy={busy}
        onStop={revise.stop}
        placeholder={posted ? `The ${name} draft is posted` : 'Ask for a change…'}
        sendLabel="Send"
        commands={commands}
      />
    </div>
  )
}
