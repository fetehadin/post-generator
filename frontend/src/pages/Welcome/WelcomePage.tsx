import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useMe } from '../../api/me'
import { useSavePlatformSettings } from '../../api/platforms'
import { useSaveProfile } from '../../api/profile'
import type { AudienceProfession, Platform } from '../../api/types'
import { LABEL, PLATFORMS } from '../../lib/platforms'
import { cn } from '../../lib/utils'
import { markWelcomed } from '../../lib/welcome'

const PROFESSIONS: Array<[AudienceProfession, string]> = [
  ['developers', 'Developers'],
  ['general', 'Everyone'],
  ['business', 'Business people'],
  ['students', 'Students'],
  ['creatives', 'Designers and creatives'],
]
const STEPS = ['Platforms', 'About you', 'Audience', 'Your posts'] as const

const input =
  'mt-1 block min-h-10 w-full rounded-control border border-edge bg-surface px-3 text-sm'
const primary =
  'inline-flex min-h-10 items-center rounded-control bg-primary px-4 text-sm font-semibold text-on-primary disabled:cursor-not-allowed disabled:bg-sunken disabled:text-muted'
const secondary =
  'inline-flex min-h-10 items-center rounded-control border border-edge px-4 text-sm'

/**
 * First run (DESIGN.md §4.5, FR-33), after the invite and the privacy notice: pick platforms
 * → role and focus → who reads you and where (pre-filled from your time zone) → import an
 * export or write a first draft. Four short steps; everything else waits in Profile.
 */
export function WelcomePage() {
  const me = useMe().data
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [platforms, setPlatforms] = useState<Platform[]>([])
  const [role, setRole] = useState('')
  const [focus, setFocus] = useState('')
  const [profession, setProfession] = useState<AudienceProfession>('developers')
  const [zone, setZone] = useState(() =>
    me?.timezone && me.timezone !== 'UTC'
      ? me.timezone
      : Intl.DateTimeFormat().resolvedOptions().timeZone,
  )
  const profile = useSaveProfile()
  const x = useSavePlatformSettings('x')
  const linkedin = useSavePlatformSettings('linkedin')
  const telegram = useSavePlatformSettings('telegram')
  const savers = { x, linkedin, telegram }
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function finish(to: string, state?: unknown) {
    if (me) markWelcomed(me.id)
    navigate(to, { state })
  }

  async function saveAudience() {
    setSaving(true)
    setError('')
    try {
      await Promise.all(
        platforms.map((p) =>
          savers[p].mutateAsync({
            audience_profession: profession,
            audience_places: [{ timezone: zone, share: 100 }],
          }),
        ),
      )
      setStep(3)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="mx-auto max-w-[560px] px-4 py-12 md:py-20">
      <p className="text-sm text-muted">
        Step {step + 1} of {STEPS.length} · {STEPS[step]}
      </p>
      <ol aria-hidden="true" className="mt-2 flex gap-1">
        {STEPS.map((s, i) => (
          <li key={s} className={cn('h-1 flex-1 rounded-full', i <= step ? 'bg-ink' : 'bg-line')} />
        ))}
      </ol>

      {step === 0 && (
        <section className="mt-8">
          <h1 className="text-2xl font-semibold tracking-tight">Where do you post?</h1>
          <p className="mt-2 text-muted">Pick one or more. You can add the others later.</p>
          <div role="group" aria-label="Platforms" className="mt-6 flex flex-wrap gap-2">
            {PLATFORMS.map((p) => {
              const on = platforms.includes(p)
              return (
                <button
                  key={p}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    setPlatforms(on ? platforms.filter((q) => q !== p) : [...platforms, p])
                  }
                  className={cn(
                    'min-h-11 rounded-full border px-5 text-sm',
                    on
                      ? 'border-primary bg-primary font-semibold text-on-primary'
                      : 'border-line text-muted hover:border-edge hover:text-ink',
                  )}
                >
                  {LABEL[p]}
                </button>
              )
            })}
          </div>
          <div className="mt-8 flex gap-3">
            <button
              type="button"
              className={primary}
              disabled={!platforms.length}
              onClick={() => setStep(1)}
            >
              Continue
            </button>
            <button
              type="button"
              className="text-sm text-muted underline"
              onClick={() => finish('/')}
            >
              Skip the setup
            </button>
          </div>
        </section>
      )}

      {step === 1 && (
        <form
          className="mt-8"
          onSubmit={(e) => {
            e.preventDefault()
            profile.mutate(
              { role: role.trim(), focus: focus.trim() },
              { onSuccess: () => setStep(2) },
            )
          }}
        >
          <h1 className="text-2xl font-semibold tracking-tight">About you</h1>
          <p className="mt-2 text-muted">
            Drafts only say what you tell Voxlace. Two lines are enough.
          </p>
          <label className="mt-6 block text-sm">
            What you do
            <input
              className={input}
              value={role}
              required
              placeholder="Backend developer, CS student, founder…"
              onChange={(e) => setRole(e.target.value)}
            />
          </label>
          <label className="mt-4 block text-sm">
            What you're working on or getting better at
            <input
              className={input}
              value={focus}
              placeholder="A FastAPI side project, system design…"
              onChange={(e) => setFocus(e.target.value)}
            />
          </label>
          {profile.isError && (
            <p role="alert" className="mt-4 text-sm text-danger">
              {profile.error.message}
            </p>
          )}
          <div className="mt-8 flex gap-3">
            <button type="submit" className={primary} disabled={!role.trim() || profile.isPending}>
              {profile.isPending ? 'Saving…' : 'Continue'}
            </button>
            <button type="button" className={secondary} onClick={() => setStep(0)}>
              Back
            </button>
          </div>
        </form>
      )}

      {step === 2 && (
        <form
          className="mt-8"
          onSubmit={(e) => {
            e.preventDefault()
            void saveAudience()
          }}
        >
          <h1 className="text-2xl font-semibold tracking-tight">Who reads you?</h1>
          <p className="mt-2 text-muted">
            Voxlace picks the hour to post from this. You can set each platform apart in Profile.
          </p>
          <label className="mt-6 block text-sm">
            Mostly
            <select
              className={input}
              value={profession}
              onChange={(e) => setProfession(e.target.value as AudienceProfession)}
            >
              {PROFESSIONS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="mt-4 block text-sm">
            Mostly living in the time zone
            <input
              className={input}
              value={zone}
              required
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => setZone(e.target.value)}
            />
          </label>
          <p className="mt-1 text-sm text-muted">Yours, to start with. Like Africa/Addis_Ababa.</p>
          {error && (
            <p role="alert" className="mt-4 text-sm text-danger">
              {error}
            </p>
          )}
          <div className="mt-8 flex gap-3">
            <button type="submit" className={primary} disabled={!zone.trim() || saving}>
              {saving ? 'Saving…' : 'Continue'}
            </button>
            <button type="button" className={secondary} onClick={() => setStep(1)}>
              Back
            </button>
          </div>
        </form>
      )}

      {step === 3 && (
        <section className="mt-8">
          <h1 className="text-2xl font-semibold tracking-tight">Teach it your voice</h1>
          <p className="mt-2 text-muted">
            Upload the export of your posts ({platforms.map((p) => LABEL[p]).join(', ')}). It takes
            a minute; the file is read once and deleted. Until then, drafts follow example posts for
            their shape, not your voice.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <button type="button" className={primary} onClick={() => finish('/import')}>
              Import my posts
            </button>
            <button
              type="button"
              className={secondary}
              onClick={() =>
                finish('/', {
                  text: focus.trim()
                    ? `A lesson from working on ${focus.trim()}: `
                    : 'Today I shipped ',
                })
              }
            >
              Skip, write a first draft
            </button>
          </div>
        </section>
      )}
    </main>
  )
}
