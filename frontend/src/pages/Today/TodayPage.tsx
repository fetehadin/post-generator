import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useDraftPrompt, useGenerateDrafts, type DraftOutcome } from '../../api/drafts'
import type { Draft, Platform } from '../../api/types'
import { LengthCounter } from '../../components/LengthCounter'
import type { CountingRule } from '../../lib/xCount'

// Phase 1 has no GET /platform-profiles yet (Phase 3); until then the editor needs the rule
// for live counting. The server still counts and returns length.limit for each draft.
const RULES: Record<Platform, CountingRule> = {
  telegram: 'plain',
  x: 'x_weighted',
  linkedin: 'plain',
}
const PLATFORMS: Array<{ id: Platform; label: string }> = [
  { id: 'x', label: 'X' },
  { id: 'linkedin', label: 'LinkedIn' },
  { id: 'telegram', label: 'Telegram' },
]
const LABEL: Record<Platform, string> = { x: 'X', linkedin: 'LinkedIn', telegram: 'Telegram' }

/** Small platform marks, drawn for Voxlace; the name is always given in text too. */
function PlatformMark({ platform }: { platform: Platform }) {
  const common = 'size-[18px] flex-none'
  if (platform === 'x')
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={common}>
        <path
          d="M4 4l16 16M20 4L4 20"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
      </svg>
    )
  if (platform === 'linkedin')
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={common}>
        <rect x="2.5" y="2.5" width="19" height="19" rx="4" fill="currentColor" />
        <path
          d="M7.5 10.5v6M7.5 7.5v.01M11.5 16.5v-6M11.5 13c0-1.7 1-2.6 2.4-2.6s2.1.9 2.1 2.6v3.5"
          stroke="var(--surface)"
          strokeWidth="1.9"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
    )
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={common}>
      <path
        d="M21 4L3 11l6 2 2 6 3-4 5 4z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** Seconds since `active` became true; 0 when inactive. Drives the slow states in DESIGN.md §7. */
function useElapsed(active: boolean) {
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    if (!active) return
    const started = Date.now()
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000)
    return () => {
      clearInterval(timer)
      setSeconds(0)
    }
  }, [active])
  return seconds
}

const today = new Intl.DateTimeFormat('en', { weekday: 'long', day: 'numeric', month: 'long' })

/**
 * Home (DESIGN.md §2, decided 21 Oct 2026): "What did you do today?", feed your progress, pick
 * platforms with their logo buttons, Generate N drafts (FR-6, FR-7, FR-8, FR-9, FR-11).
 */
export function TodayPage() {
  const [topic, setTopic] = useState('')
  const [chosen, setChosen] = useState<Platform[]>(['telegram'])
  const generate = useGenerateDrafts()
  const elapsed = useElapsed(generate.isPending)
  const n = chosen.length

  function toggle(p: Platform) {
    setChosen((c) => (c.includes(p) ? c.filter((x) => x !== p) : [...c, p]))
  }

  return (
    <div className="mx-auto max-w-[720px] px-4 pt-12 pb-16 md:px-6 md:pt-[12vh]">
      <p className="text-sm text-muted">{today.format(new Date())}</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">What did you do today?</h1>

      <form
        className="mt-8 rounded-ask border border-edge bg-surface py-3 pr-3 pl-4 focus-within:border-thread focus-within:ring-1 focus-within:ring-thread md:pl-6"
        onSubmit={(e) => {
          e.preventDefault()
          if (topic.trim() && n) generate.mutate({ platforms: chosen, topic })
        }}
      >
        <label htmlFor="topic" className="sr-only">
          What you worked on
        </label>
        <textarea
          id="topic"
          rows={2}
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) e.currentTarget.form?.requestSubmit()
          }}
          placeholder="Tell Voxlace about your progress: what you built, fixed or learned…"
          className="block max-h-60 min-h-14 w-full resize-none bg-transparent py-2 font-serif text-lg leading-[1.7] outline-none [field-sizing:content] placeholder:text-muted focus-visible:outline-none"
        />
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Write for" className="flex flex-1 flex-wrap gap-2">
            {PLATFORMS.map((p) => {
              const on = chosen.includes(p.id)
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(p.id)}
                  className={`inline-flex size-10 items-center justify-center rounded-full border ${
                    on ? 'border-thread bg-thread-soft text-ink' : 'border-edge text-muted'
                  }`}
                  title={p.label}
                >
                  <PlatformMark platform={p.id} />
                  <span className="sr-only">{p.label}</span>
                </button>
              )
            })}
          </div>
          <button
            type="submit"
            disabled={!topic.trim() || !n || generate.isPending}
            className="inline-flex min-h-10 items-center rounded-control bg-thread px-4 text-sm font-semibold text-on-thread disabled:cursor-not-allowed disabled:bg-sunken disabled:text-muted"
          >
            {generate.isPending
              ? 'Writing…'
              : n === 1
                ? 'Generate 1 draft'
                : `Generate ${n} drafts`}
          </button>
        </div>
        {!n && <p className="mt-2 text-xs text-muted">Pick at least one platform.</p>}
      </form>

      <section aria-live="polite" className="mt-10 flex flex-col gap-12">
        {generate.isPending && (
          <p className="text-muted">
            {elapsed < 3 && `Writing ${n === 1 ? 'your draft' : `${n} drafts`}…`}
            {elapsed >= 3 && elapsed < 20 && 'Still working…'}
            {elapsed >= 20 &&
              'This is taking longer than usual: the AI is busy. Your text is saved; you can keep waiting.'}
          </p>
        )}
        {generate.isError && (
          <p role="alert" className="text-danger">
            {generate.error.message}
          </p>
        )}
        {generate.data?.map((outcome) => (
          <Outcome key={outcome.platform} outcome={outcome} />
        ))}
      </section>
    </div>
  )
}

function Outcome({ outcome }: { outcome: DraftOutcome }) {
  if (outcome.ok) return <DraftView key={outcome.draft.id} draft={outcome.draft} />
  const noPosts = 'code' in outcome.error && outcome.error.code === 'no_posts'
  return (
    <p role="alert" className="text-danger">
      <b>{LABEL[outcome.platform]}:</b> {outcome.error.message}{' '}
      {noPosts && (
        <Link to="/import" className="text-thread underline underline-offset-4">
          Import your {LABEL[outcome.platform]} posts
        </Link>
      )}
    </p>
  )
}

/** The draft as plain serif text, editable; counter and the AI tag underneath (§4.2). */
function DraftView({ draft }: { draft: Draft }) {
  const [text, setText] = useState(draft.text)
  return (
    <article aria-label={`${LABEL[draft.platform]} draft`}>
      <div className="mb-3 flex items-center gap-2 text-sm">
        <PlatformMark platform={draft.platform} />
        <span className="font-semibold">{LABEL[draft.platform]} draft</span>
        <span className="rounded-full border border-line px-2 text-xs text-muted">Draft</span>
      </div>
      <label htmlFor={`draft-${draft.id}`} className="sr-only">
        {LABEL[draft.platform]} draft text
      </label>
      <textarea
        id={`draft-${draft.id}`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="-ml-4 block min-h-32 w-[calc(100%+1rem)] resize-y border-l-2 border-transparent bg-transparent pl-4 font-serif text-lg leading-[1.7] outline-none [field-sizing:content] hover:border-line focus:border-thread"
      />
      <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
        <LengthCounter text={text} rule={RULES[draft.platform]} limit={draft.length.limit} />
        <span className="rounded-full border border-line px-2 text-xs text-muted">AI draft</span>
      </div>
      {import.meta.env.DEV && <PromptDebug id={draft.id} />}
    </article>
  )
}

/**
 * BUILD_PLAN Phase 1 "show the prompt log (debug view)". Developers only: users see just the
 * draft (DESIGN.md §1), and production builds drop this code entirely (import.meta.env.DEV).
 */
function PromptDebug({ id }: { id: string }) {
  const [open, setOpen] = useState(false)
  const log = useDraftPrompt(id, open)
  return (
    <details className="mt-6 text-xs text-muted" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="cursor-pointer">Prompt (developer view)</summary>
      {log.data && (
        <>
          <p className="mt-2">
            {log.data.provider} · asked {log.data.model} · answered {log.data.model_version}
          </p>
          <pre className="mt-2 max-h-96 overflow-auto rounded-control bg-sunken p-3 whitespace-pre-wrap">
            {log.data.prompt}
          </pre>
        </>
      )}
      {log.isError && <p role="alert">{log.error.message}</p>}
    </details>
  )
}
