import { useId, useState } from 'react'
import { Link } from 'react-router'
import { useGuestRevise, useGuestWrite, type GuestDraft } from '../../api/guest'
import type { Platform } from '../../api/types'
import { LengthCounter } from '../../components/LengthCounter'
import { PlatformMark } from '../../components/PlatformMark'
import { cn } from '../../lib/utils'
import { loadGuest, saveGuest } from '../../lib/guest'
import { LABEL, PLATFORMS, RULES } from '../../lib/platforms'

const QUICK = ['Shorter', 'Punchier', 'End with a question']

/**
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
  const write = useGuestWrite()
  const boxId = useId()
  const empty = !topic.trim()

  function keep(next: GuestDraft[], text = topic) {
    setDrafts(next)
    saveGuest({ topic: text.trim(), drafts: next })
  }

  function generate() {
    if (empty || !platforms.length || write.isPending) return
    write.mutate({ topic: topic.trim(), platforms }, { onSuccess: (r) => keep(r.drafts) })
  }

  function toggle(p: Platform) {
    setPlatforms((on) =>
      on.includes(p)
        ? on.filter((x) => x !== p)
        : PLATFORMS.filter((x) => x === p || on.includes(x)),
    )
  }

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-line px-4 py-3 md:px-6">
        <span className="text-lg font-semibold tracking-tight">Voxlace</span>
        <nav className="flex items-center gap-2 text-sm">
          <Link to="/login" className="min-h-10 rounded-control px-3 py-2 hover:bg-sunken">
            Log in
          </Link>
          <Link
            to="/login"
            state={{ mode: 'signup' }}
            className="min-h-10 rounded-control bg-primary px-4 py-2 font-semibold text-on-primary"
          >
            Create account
          </Link>
        </nav>
      </header>
      <main className="mx-auto max-w-column px-4 pt-10 pb-16 md:px-6">
        <p className="rounded-panel border border-line bg-sunken p-3 text-sm">
          You're trying Voxlace as a guest. Nothing you write is saved on our server.{' '}
          <Link
            to="/login"
            state={{ mode: 'signup' }}
            className="text-thread underline underline-offset-4"
          >
            Create a free account
          </Link>{' '}
          to keep your drafts and history, and to make drafts sound like you from your own posts.
        </p>
        <h1 className="mt-8 text-2xl font-semibold tracking-tight">
          <label htmlFor={boxId}>What did you do today?</label>
        </h1>
        <form
          className="mt-6 rounded-panel border border-edge bg-surface p-3 focus-within:outline-2 focus-within:outline-thread"
          onSubmit={(e) => {
            e.preventDefault()
            generate()
          }}
        >
          <textarea
            id={boxId}
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) generate()
            }}
            rows={3}
            maxLength={4000}
            placeholder="What you built, fixed or learned…"
            className="block w-full resize-none bg-transparent px-1 font-serif text-lg leading-writing outline-none [field-sizing:content] placeholder:text-muted"
          />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <div role="group" aria-label="Which platforms?" className="flex flex-wrap gap-2">
              {PLATFORMS.map((p) => (
                <button
                  key={p}
                  type="button"
                  aria-pressed={platforms.includes(p)}
                  onClick={() => toggle(p)}
                  className={cn(
                    'min-h-9 rounded-full border px-3 text-sm',
                    platforms.includes(p)
                      ? 'border-primary bg-sunken font-semibold'
                      : 'border-edge',
                  )}
                >
                  {LABEL[p]}
                </button>
              ))}
            </div>
            <button
              type="submit"
              disabled={empty || !platforms.length || write.isPending}
              className="min-h-10 rounded-control bg-primary px-4 text-sm font-semibold text-on-primary disabled:opacity-50"
            >
              {write.isPending
                ? 'Writing…'
                : platforms.length > 1
                  ? `Write ${platforms.length} drafts`
                  : 'Write a draft'}
            </button>
          </div>
        </form>
        {write.error && (
          <p role="alert" className="mt-3 text-sm text-danger">
            {write.error.message} Your text is still here.
          </p>
        )}
        {write.data?.failures.map((f) => (
          <p key={f.platform} role="alert" className="mt-3 text-sm text-danger">
            {LABEL[f.platform]}: {f.message}
          </p>
        ))}
        <div className="mt-8 flex flex-col gap-4">
          {drafts.map((d, i) => (
            <GuestCard
              key={`${d.platform}-${i}`}
              draft={d}
              onChange={(next) => keep(drafts.map((x, j) => (j === i ? next : x)))}
            />
          ))}
        </div>
      </main>
    </div>
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
      <p className="mt-3 font-serif text-lg leading-writing whitespace-pre-wrap">{draft.text}</p>
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
          className="min-h-10 rounded-control border border-edge px-4 text-sm hover:bg-sunken disabled:opacity-50"
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
          className="min-h-10 rounded-control border border-edge px-4 text-sm hover:bg-sunken"
        >
          {copied ? 'Copied' : 'Copy text'}
        </button>
        <Link
          to="/login"
          state={{ mode: 'signup' }}
          className="min-h-10 rounded-control bg-primary px-4 py-2 text-sm font-semibold text-on-primary"
        >
          Save, approve and schedule: create an account
        </Link>
      </div>
    </article>
  )
}
