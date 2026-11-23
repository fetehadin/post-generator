import { useState } from 'react'
import { Link } from 'react-router'
import { useProfile, useSaveProfile } from '../api/profile'
import { MAIN_GOALS, type MainGoal } from '../lib/profession'
import { snooze, snoozed } from '../lib/storage'
import { chip, chipOn, ghost } from '../lib/ui'
import { cn } from '../lib/utils'
import { Icon } from './Icon'

const SNOOZE = 'voice-setup'
const PROFESSIONS = ['developer', 'designer', 'teacher', 'marketer', 'founder', 'student', 'doctor']

/**
 * First run, after the first draft (FR-17, FR-33; DESIGN.md §4.5, changed 21 Nov 2026): two
 * optional questions as one-tap chips, never a gate. Shown to accounts that haven't said what
 * they do yet; "Not now" hides it for a week. Everything else waits in Profile.
 */
export function VoiceSetup() {
  const profile = useProfile()
  const save = useSaveProfile()
  const [hidden, setHidden] = useState(() => snoozed(SNOOZE))
  const [job, setJob] = useState('')
  const [goal, setGoal] = useState<MainGoal>('')

  // Asked only once: someone who already has a role never sees it.
  if (hidden || !profile.data || (profile.data.role.trim() && !job)) return null
  const done = Boolean(job && goal)

  return (
    <section
      aria-labelledby="voice-setup"
      className="rounded-panel border border-line bg-surface p-5 text-sm"
    >
      <h2 id="voice-setup" className="flex items-center gap-2 font-semibold">
        <Icon name="nib" className="size-4 text-thread" />
        {done ? 'Thanks. Your next drafts use this.' : 'Make your drafts sound more like you'}
      </h2>
      {!done && (
        <p className="mt-1 text-muted">Optional. Two taps; change it any time in Profile.</p>
      )}

      <p className="mt-4 font-semibold">What do you do?</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {PROFESSIONS.map((p) => (
          <button
            key={p}
            type="button"
            aria-pressed={job === p}
            disabled={save.isPending}
            onClick={() => {
              setJob(p)
              save.mutate({ discipline: p, role: p[0].toUpperCase() + p.slice(1) })
            }}
            className={cn(chip, job === p && chipOn)}
          >
            {p[0].toUpperCase() + p.slice(1)}
          </button>
        ))}
        <Link to="/profile" className={cn(chip, 'text-muted')} data-button>
          Something else…
        </Link>
      </div>

      <p className="mt-4 font-semibold">Why do you post?</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {MAIN_GOALS.filter(([v]) => v).map(([v, label]) => (
          <button
            key={v}
            type="button"
            aria-pressed={goal === v}
            disabled={save.isPending}
            onClick={() => {
              setGoal(v)
              save.mutate({ main_goal: v })
            }}
            className={cn(chip, goal === v && chipOn)}
          >
            {label}
          </button>
        ))}
      </div>

      {save.isError && (
        <p role="alert" className="mt-3 text-danger">
          {save.error.message}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
        <Link to="/import" className="text-thread underline underline-offset-4">
          Import your past posts
        </Link>
        <span className="text-muted">for a closer voice.</span>
        <button
          type="button"
          onClick={() => {
            snooze(SNOOZE)
            setHidden(true)
          }}
          className={cn(ghost, 'ml-auto')}
        >
          {done ? 'Close' : 'Not now'}
        </button>
      </div>
    </section>
  )
}
