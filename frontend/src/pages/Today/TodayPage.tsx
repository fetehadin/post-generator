import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useCreateCheckin } from '../../api/checkins'
import { useDrafts, useGenerateDrafts, type DraftOutcome } from '../../api/drafts'
import { useProfile } from '../../api/profile'
import type { Platform } from '../../api/types'
import { DraftRowLink } from '../../components/DraftRowLink'
import { PlatformMark } from '../../components/PlatformMark'
import { LABEL } from '../../lib/platforms'
import { localDate, startOfLocalDay } from '../../lib/time'

const PLATFORMS: Platform[] = ['x', 'linkedin', 'telegram']
const STARTERS = ['Today I shipped ', 'A lesson from this week: ', 'A problem I solved: ']

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
 * Home (DESIGN.md §2 and §4.1): tell Voxlace what you did, then
 * - Generate N drafts from it (it's saved as today's check-in too), or
 * - Just save it, so later drafts know (FR-6), or
 * - leave the box empty and generate from what Voxlace already knows: the summary card (FR-19).
 * Today's drafts are rows that open the editor.
 */
export function TodayPage() {
  const [topic, setTopic] = useState('')
  const [chosen, setChosen] = useState<Platform[]>(['telegram'])
  const [saved, setSaved] = useState(false)
  const [since] = useState(startOfLocalDay)
  const profile = useProfile()
  const checkin = useCreateCheckin()
  const generate = useGenerateDrafts()
  const drafts = useDrafts({ created_from: since })
  const elapsed = useElapsed(generate.isPending)

  const n = chosen.length
  const hasCard = Boolean(profile.data?.summary_card.trim())
  const empty = !topic.trim()
  const busy = generate.isPending || checkin.isPending
  const failed = generate.data?.filter((o) => !o.ok) ?? []

  function toggle(p: Platform) {
    setChosen((c) => (c.includes(p) ? c.filter((x) => x !== p) : [...c, p]))
  }

  async function run() {
    setSaved(false)
    let checkinId: string | undefined
    if (!empty) checkinId = (await checkin.mutateAsync({ text: topic, day: localDate() })).id
    const outcomes = await generate.mutateAsync({ platforms: chosen, topic, checkinId })
    if (outcomes.every((o) => o.ok)) setTopic('') // it's saved; a failure keeps the text
  }

  async function justSave() {
    await checkin.mutateAsync({ text: topic, day: localDate() })
    setTopic('')
    setSaved(true)
  }

  const label = n === 1 ? 'Generate 1 draft' : `Generate ${n} drafts`

  return (
    <div className="mx-auto max-w-[720px] px-4 pt-12 pb-16 md:px-6 md:pt-[12vh]">
      <p className="text-sm text-muted">{today.format(new Date())}</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">What did you do today?</h1>

      <form
        className="mt-8 rounded-ask border border-edge bg-surface py-3 pr-3 pl-4 focus-within:border-thread focus-within:ring-1 focus-within:ring-thread md:pl-6"
        onSubmit={(e) => {
          e.preventDefault()
          if (n && (!empty || hasCard)) void run().catch(() => {})
        }}
      >
        <label htmlFor="topic" className="sr-only">
          What you worked on
        </label>
        <textarea
          id="topic"
          rows={2}
          value={topic}
          onChange={(e) => {
            setTopic(e.target.value)
            setSaved(false)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) e.currentTarget.form?.requestSubmit()
          }}
          placeholder="Tell Voxlace about your progress: what you built, fixed or learned…"
          className="block max-h-60 min-h-14 w-full resize-none bg-transparent py-2 font-serif text-lg leading-[1.7] outline-none [field-sizing:content] placeholder:text-muted focus-visible:outline-none"
        />
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Write for" className="flex flex-1 flex-wrap gap-2">
            {PLATFORMS.map((p) => {
              const on = chosen.includes(p)
              return (
                <button
                  key={p}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(p)}
                  className={`inline-flex size-10 items-center justify-center rounded-full border ${
                    on ? 'border-thread bg-thread-soft text-ink' : 'border-edge text-muted'
                  }`}
                  title={LABEL[p]}
                >
                  <PlatformMark platform={p} />
                  <span className="sr-only">{LABEL[p]}</span>
                </button>
              )
            })}
          </div>
          <button
            type="button"
            onClick={() => void justSave().catch(() => {})}
            disabled={empty || busy}
            className="inline-flex min-h-10 items-center rounded-control border border-edge px-4 text-sm disabled:cursor-not-allowed disabled:text-muted"
          >
            Just save
          </button>
          <button
            type="submit"
            disabled={!n || busy || (empty && !hasCard)}
            className="inline-flex min-h-10 items-center rounded-control bg-thread px-4 text-sm font-semibold text-on-thread disabled:cursor-not-allowed disabled:bg-sunken disabled:text-muted"
          >
            {generate.isPending ? 'Writing…' : label}
          </button>
        </div>
        {!n && <p className="mt-2 text-xs text-muted">Pick at least one platform.</p>}
      </form>

      <p className="mt-3 text-sm text-muted" role="status">
        {saved && 'Saved to your check-ins. Drafts can use it later.'}
        {!saved &&
          empty &&
          hasCard &&
          'Box empty? Generate writes from what Voxlace knows about you.'}
        {empty && profile.isSuccess && !hasCard && !saved && (
          <>
            To generate with an empty box,{' '}
            <Link to="/profile" className="text-thread underline underline-offset-4">
              write your summary card
            </Link>
            .
          </>
        )}
      </p>

      {empty && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">Try:</span>
          {STARTERS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setTopic(s)
                document.getElementById('topic')?.focus()
              }}
              className="min-h-8 rounded-full border border-line px-3 hover:border-edge"
            >
              {s.replace(/[: ]+$/, '')}
            </button>
          ))}
        </div>
      )}

      <section aria-live="polite" className="mt-6 flex flex-col gap-3">
        {generate.isPending && (
          <p className="text-muted">
            {elapsed < 3 && `Writing ${n === 1 ? 'your draft' : `${n} drafts`}…`}
            {elapsed >= 3 && elapsed < 20 && 'Still working…'}
            {elapsed >= 20 &&
              'This is taking longer than usual: the AI is busy. Your text is saved; you can keep waiting.'}
          </p>
        )}
        {checkin.isError && (
          <p role="alert" className="text-danger">
            {checkin.error.message}
          </p>
        )}
        {failed.map((o) => (
          <Failure key={o.platform} outcome={o} />
        ))}
      </section>

      <section aria-labelledby="today-drafts" className="mt-10">
        <h2 id="today-drafts" className="text-sm font-semibold text-muted">
          Today's drafts
        </h2>
        {drafts.data?.items.length ? (
          <div className="mt-2 border-t border-line">
            {drafts.data.items.map((d) => (
              <DraftRowLink key={d.id} draft={d} />
            ))}
          </div>
        ) : (
          drafts.isSuccess && <p className="mt-2 text-sm text-muted">None yet.</p>
        )}
      </section>
    </div>
  )
}

function Failure({ outcome }: { outcome: DraftOutcome }) {
  if (outcome.ok) return null
  const code = 'code' in outcome.error ? outcome.error.code : ''
  return (
    <p role="alert" className="text-danger">
      <b>{LABEL[outcome.platform]}:</b> {outcome.error.message}{' '}
      {code === 'no_posts' && (
        <Link to="/import" className="text-thread underline underline-offset-4">
          Import your {LABEL[outcome.platform]} posts
        </Link>
      )}
    </p>
  )
}
