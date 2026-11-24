import { useId, useRef, useState } from 'react'
import { Link } from 'react-router'
import { useGuestRevise, useGuestWrite, type GuestDraft } from '../../api/guest'
import type { Platform } from '../../api/types'
import { LengthCounter } from '../../components/LengthCounter'
import { PlatformMark } from '../../components/PlatformMark'
import { cn } from '../../lib/utils'
import { loadGuest, saveGuest } from '../../lib/guest'
import { LABEL, RULES } from '../../lib/platforms'
import { Wordmark } from '../../components/Logo'
import { Composer } from '../../components/Composer'
import { ApiError } from '../../api/client'
import { WritingCard } from '../Chat/AiStatus'
import { starterLabel, startersFor } from '../../lib/starters'
import { chip, chipOn, ghost, primary, secondary } from '../../lib/ui'
import { HomeSections } from './HomeSections'
import { exampleFor, ROLES, type Role } from './roles'

const QUICK = ['Shorter', 'Punchier', 'End with a question']

/**
 * The homepage for logged-out visitors (FR-50, DESIGN.md §4.6) around the guest box.
 *
 * Trying Voxlace without an account (FR-47): write what you did, get a draft per platform,
 * ask for changes and copy the text. Nothing is stored on our server; the drafts stay in
 * this browser and move into the account at login. Approving, scheduling, importing your
 * posts and history ask you to log in.
 */
export function GuestPage() {
  const saved = loadGuest()
  const [topic, setTopic] = useState(saved?.topic ?? '')
  const [platforms, setPlatforms] = useState<Platform[]>(['x', 'linkedin'])
  const [drafts, setDrafts] = useState<GuestDraft[]>(saved?.drafts ?? [])
  const [role, setRole] = useState<Role | null>(null)
  const [asked, setAsked] = useState<Platform[]>([])
  const request = useRef(0)
  const write = useGuestWrite()
  const boxId = useId()
  const empty = !topic.trim()
  const writing = write.isPending

  function keep(next: GuestDraft[], text = topic) {
    setDrafts(next)
    saveGuest({ topic: text.trim(), drafts: next })
  }

  function generate() {
    if (empty || !platforms.length || writing) return
    const run = ++request.current
    setAsked(platforms)
    write.mutate(
      { topic: topic.trim(), platforms },
      // A stopped request may still finish on the server: its answer is dropped (DESIGN §7).
      { onSuccess: (r) => run === request.current && keep(r.drafts) },
    )
  }

  /** Stop waiting: the text stays in the box; a late answer is ignored. */
  function stop() {
    request.current++
    write.reset()
  }

  function pickStarter(s: string) {
    setTopic(s)
    document.getElementById(boxId)?.focus()
  }

  const example = exampleFor(role)

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-line bg-paper px-4 py-3 md:px-6">
        <Wordmark className="h-5 w-auto text-ink" />
        <nav className="flex items-center gap-1 text-sm">
          <Link to="/login" className={ghost}>
            Log in
          </Link>
          <Link to="/login" state={{ mode: 'signup' }} className={primary}>
            Start free
          </Link>
        </nav>
      </header>
      <main className="mx-auto max-w-column px-4 pt-10 pb-6 md:px-6 md:pt-16">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">
          Posts for X, LinkedIn and Telegram, written in your own voice.
        </h1>
        <p className="mt-3 text-muted">
          Say what you did today. Get a draft for each platform, edit it, and post it when you
          approve.
        </p>

        <div role="group" aria-label="I am a" className="mt-6 flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted">I'm a</span>
          {ROLES.map((r) => (
            <button
              key={r.id}
              type="button"
              aria-pressed={role === r.id}
              onClick={() => setRole(role === r.id ? null : r.id)}
              className={cn(chip, role === r.id && chipOn)}
            >
              {r.label}
            </button>
          ))}
        </div>

        <label htmlFor={boxId} className="mt-6 mb-2 block font-semibold">
          What did you do today?
        </label>
        <Composer
          id={boxId}
          value={topic}
          onChange={setTopic}
          onSubmit={generate}
          canSubmit={!empty && platforms.length > 0}
          busy={writing}
          onStop={stop}
          placeholder="What you made, fixed or learned…"
          maxLength={4000}
          sendLabel={platforms.length > 1 ? `Write ${platforms.length} drafts` : 'Write a draft'}
          platforms={{ value: platforms, onChange: setPlatforms }}
          rows={2}
          menu="below"
        />
        {empty && (
          <div className="mt-3 flex flex-wrap gap-2">
            {startersFor(role ?? undefined).map((s) => (
              <button key={s} type="button" onClick={() => pickStarter(s)} className={chip}>
                {starterLabel(s)}
              </button>
            ))}
          </div>
        )}
        <p className="mt-3 text-sm text-muted">
          No account needed. Nothing you write is saved on our server. Guest drafts use a general
          style; create an account and import your posts to sound like you.
        </p>
        {write.error &&
          (write.error instanceof ApiError && write.error.code === 'guest_limit' ? (
            <p role="status" className="mt-3 text-sm text-muted">
              You've used today's free guest drafts. Come back tomorrow, or{' '}
              <Link
                to="/login"
                state={{ mode: 'signup' }}
                className="text-thread underline underline-offset-4"
              >
                create a free account
              </Link>{' '}
              to keep going. Your text is still here.
            </p>
          ) : (
            <p role="alert" className="mt-3 text-sm text-danger">
              {write.error.message} Your text is still here.
            </p>
          ))}
        {write.data?.failures.map((f) => (
          <p key={f.platform} role="alert" className="mt-3 text-sm text-danger">
            {LABEL[f.platform]}: {f.message}
          </p>
        ))}
        <div className="mt-8 flex flex-col gap-4">
          {writing && asked.map((p) => <WritingCard key={p} platform={p} onStop={stop} />)}
          {drafts.length === 0 && !writing && <ExampleCard text={example.draft} />}
          {drafts.map((d, i) => (
            <GuestCard
              key={`${d.platform}-${i}`}
              draft={d}
              onChange={(next) => keep(drafts.map((x, j) => (j === i ? next : x)))}
            />
          ))}
        </div>

        <HomeSections />
      </main>
    </div>
  )
}

/** A made-up draft for the chosen role, shown until the visitor has real ones (FR-50). */
function ExampleCard({ text }: { text: string }) {
  return (
    <article aria-label="Example draft" className="rounded-panel border border-line bg-surface p-4">
      <header className="flex items-center gap-2 text-sm">
        <PlatformMark platform="x" />
        <span className="font-semibold">Example</span>
        <span className="text-muted">· what an X draft looks like</span>
      </header>
      <p className="mt-3 text-md leading-writing whitespace-pre-wrap text-muted">{text}</p>
    </article>
  )
}

function GuestCard({ draft, onChange }: { draft: GuestDraft; onChange: (d: GuestDraft) => void }) {
  const revise = useGuestRevise()
  const [ask, setAsk] = useState('')
  const [question, setQuestion] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const askId = useId()

  function change(instruction: string) {
    if (!instruction.trim() || revise.isPending) return
    setQuestion(null)
    revise.mutate(
      { receipt: draft.receipt, instruction: instruction.trim() },
      {
        onSuccess: (r) => {
          if (r.draft) {
            onChange(r.draft)
            setAsk('')
          } else setQuestion(r.question)
        },
      },
    )
  }

  async function copy() {
    await navigator.clipboard.writeText(draft.text)
    setCopied(true)
  }

  return (
    <article
      aria-label={`${LABEL[draft.platform]} draft`}
      className="rounded-panel border border-edge bg-surface p-4"
    >
      <header className="flex flex-wrap items-center gap-2 text-sm">
        <PlatformMark platform={draft.platform} />
        <span className="font-semibold">{LABEL[draft.platform]}</span>
        <span className="rounded-full border border-thread px-2 text-xs text-thread">AI draft</span>
        <span className="ml-auto">
          <LengthCounter
            text={draft.text}
            rule={RULES[draft.platform]}
            limit={draft.length.limit}
          />
        </span>
      </header>
      <p className="mt-3 text-md leading-writing whitespace-pre-wrap">{draft.text}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {QUICK.map((q) => (
          <button
            key={q}
            type="button"
            disabled={revise.isPending}
            onClick={() => change(q)}
            className="min-h-9 rounded-full border border-edge px-3 text-sm hover:bg-sunken disabled:opacity-50"
          >
            {q}
          </button>
        ))}
      </div>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          change(ask)
        }}
      >
        <label htmlFor={askId} className="sr-only">
          Ask for a change to the {LABEL[draft.platform]} draft
        </label>
        <input
          id={askId}
          value={ask}
          onChange={(e) => setAsk(e.target.value)}
          placeholder="Ask for a change…"
          className="min-h-10 flex-1 rounded-control border border-edge bg-surface px-3 text-sm"
        />
        <button
          type="submit"
          disabled={!ask.trim() || revise.isPending}
          className="min-h-10 rounded-full border border-edge px-4 text-sm hover:bg-sunken disabled:opacity-50"
        >
          {revise.isPending ? 'Changing…' : 'Change'}
        </button>
      </form>
      {question && <p className="mt-2 text-sm">{question}</p>}
      {revise.error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {revise.error.message}
        </p>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3">
        <button
          type="button"
          onClick={() => void copy()}
          className="min-h-10 rounded-full border border-edge px-4 text-sm hover:bg-sunken"
        >
          {copied ? 'Copied' : 'Copy text'}
        </button>
        <Link to="/login" state={{ mode: 'signup' }} className={secondary}>
          Save, approve and schedule: create an account
        </Link>
      </div>
    </article>
  )
}
