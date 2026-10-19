import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useGenerateDraft } from '../../api/drafts'
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
const PLATFORMS: Array<{ id: Platform; label: string; ready: boolean }> = [
  { id: 'telegram', label: 'Telegram', ready: true },
  { id: 'x', label: 'X', ready: false },
  { id: 'linkedin', label: 'LinkedIn', ready: false },
]

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

/** Today, Phase 1 slice (DESIGN.md §4.1): one question, one box, the draft. FR-7, FR-9, FR-11. */
export function TodayPage() {
  const [topic, setTopic] = useState('')
  const generate = useGenerateDraft()
  const elapsed = useElapsed(generate.isPending)
  const noPosts = generate.error && 'code' in generate.error && generate.error.code === 'no_posts'

  return (
    <div className="mx-auto max-w-[720px] px-4 pt-12 pb-16 md:px-6 md:pt-[12vh]">
      <p className="text-sm text-muted">{today.format(new Date())}</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">What did you work on today?</h1>

      <form
        className="mt-8 rounded-ask border border-edge bg-surface py-3 pr-3 pl-4 focus-within:border-thread focus-within:ring-1 focus-within:ring-thread md:pl-6"
        onSubmit={(e) => {
          e.preventDefault()
          if (topic.trim()) generate.mutate({ platform: 'telegram', topic })
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
          placeholder="Finished the Telegram importer, 412 posts in…"
          className="block max-h-60 min-h-14 w-full resize-none bg-transparent py-2 font-serif text-lg leading-[1.7] outline-none [field-sizing:content] placeholder:text-muted"
        />
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Write for" className="flex flex-1 flex-wrap gap-2">
            {PLATFORMS.map((p) => (
              <span
                key={p.id}
                title={p.ready ? undefined : `Import your ${p.label} posts first (coming next)`}
                className={`inline-flex min-h-9 items-center gap-1 rounded-full border px-3 text-sm ${
                  p.ready ? 'border-thread bg-thread-soft' : 'border-line text-muted'
                }`}
              >
                {p.ready && <span aria-hidden="true">✓</span>}
                {p.label}
                {!p.ready && <span className="sr-only"> (not available yet)</span>}
              </span>
            ))}
          </div>
          <button
            type="submit"
            disabled={!topic.trim() || generate.isPending}
            className="inline-flex min-h-10 items-center rounded-control bg-thread px-4 text-sm font-semibold text-on-thread disabled:cursor-not-allowed disabled:bg-sunken disabled:text-muted"
          >
            {generate.isPending ? 'Writing…' : 'Generate draft'}
          </button>
        </div>
      </form>

      <section aria-live="polite" className="mt-10">
        {generate.isPending && (
          <p className="text-muted">
            {elapsed < 3 && 'Writing your Telegram draft…'}
            {elapsed >= 3 && elapsed < 20 && 'Writing your Telegram draft… Still working.'}
            {elapsed >= 20 &&
              'This is taking longer than usual: the AI is busy. Your text is saved; you can keep waiting.'}
          </p>
        )}
        {generate.isError && (
          <p role="alert" className="text-danger">
            {generate.error.message}{' '}
            {noPosts && (
              <Link to="/import" className="text-thread underline underline-offset-4">
                Import your posts
              </Link>
            )}
          </p>
        )}
        {generate.data && <DraftView key={generate.data.id} draft={generate.data} />}
      </section>
    </div>
  )
}

/** The draft as plain serif text, editable; counter and the AI tag underneath (§4.2). */
function DraftView({ draft }: { draft: Draft }) {
  const [text, setText] = useState(draft.text)
  return (
    <article aria-label="Your draft">
      <div className="mb-3 flex items-center gap-2 text-sm">
        <span className="font-semibold">Telegram draft</span>
        <span className="rounded-full border border-line px-2 text-xs text-muted">Draft</span>
      </div>
      <label htmlFor="draft" className="sr-only">
        Draft text
      </label>
      <textarea
        id="draft"
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="-ml-4 block min-h-64 w-[calc(100%+1rem)] resize-y border-l-2 border-transparent bg-transparent pl-4 font-serif text-lg leading-[1.7] outline-none [field-sizing:content] hover:border-line focus:border-thread"
      />
      <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
        <LengthCounter text={text} rule={RULES[draft.platform]} limit={draft.length.limit} />
        <span className="rounded-full border border-line px-2 text-xs text-muted">AI draft</span>
      </div>
    </article>
  )
}
