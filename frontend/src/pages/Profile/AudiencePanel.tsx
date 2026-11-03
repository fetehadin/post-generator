import { useState } from 'react'
import {
  type PlatformInfo,
  useBestHours,
  usePlatform,
  useSavePlatformSettings,
} from '../../api/platforms'
import type { AudiencePlace, AudienceProfession, Platform } from '../../api/types'
import { input, primaryButton, ZONE_LIST_ID, ZONES } from './fields'

const PROFESSIONS: Array<[AudienceProfession, string]> = [
  ['general', 'Everyone'],
  ['developers', 'Developers'],
  ['business', 'Business people'],
  ['students', 'Students'],
  ['creatives', 'Designers and creatives'],
]
const MAX_PLACES = 3 // docs/API.md PUT /platforms/{platform}/settings
const hourFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric' })

/**
 * Profile → Audience, one platform (FR-16, FR-33, FR-34): who reads you, where they live
 * (up to three time zones with shares), your goal and how often you post. Approving a draft
 * with a day picks the hour from this (FR-45), and the preview shows those hours.
 */
export function AudiencePanel({ platform, label }: { platform: Platform; label: string }) {
  const info = usePlatform(platform)
  if (info.isPending) return <p className="mt-4 text-sm text-muted">Loading…</p>
  if (info.isError)
    return (
      <p role="alert" className="mt-4 text-danger">
        {info.error.message}
      </p>
    )
  return <AudienceForm key={platform} info={info.data} label={label} />
}

function AudienceForm({ info, label }: { info: PlatformInfo; label: string }) {
  const save = useSavePlatformSettings(info.platform)
  const [profession, setProfession] = useState(info.audience_profession)
  const [places, setPlaces] = useState<AudiencePlace[]>(info.audience_places)
  const [goal, setGoal] = useState(info.goal)
  const [perWeek, setPerWeek] = useState(info.posts_per_week?.toString() ?? '')
  const [saved, setSaved] = useState(false)

  const unknown = places.find(
    (p) => ZONES.length && !ZONES.includes(p.timezone) && p.timezone !== 'UTC',
  )
  const twice = places.find((p, i) => places.findIndex((q) => q.timezone === p.timezone) !== i)
  const problem = unknown
    ? `"${unknown.timezone || 'An empty zone'}" isn't a time zone. Pick one from the list.`
    : twice
      ? `${twice.timezone} is listed twice.`
      : null

  const edit = (i: number, change: Partial<AudiencePlace>) => {
    setSaved(false)
    setPlaces(places.map((p, j) => (j === i ? { ...p, ...change } : p)))
  }

  return (
    <form
      className="mt-4 flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault()
        if (problem) return
        save.mutate(
          {
            audience_profession: profession,
            audience_places: places,
            goal,
            posts_per_week: perWeek === '' ? null : Number(perWeek),
          },
          { onSuccess: () => setSaved(true) },
        )
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm">
          Who reads you on {label}
          <select
            className={input}
            value={profession}
            onChange={(e) => {
              setSaved(false)
              setProfession(e.target.value as AudienceProfession)
            }}
          >
            {PROFESSIONS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Posts per week
          <input
            className={input}
            type="number"
            min={0}
            max={50}
            inputMode="numeric"
            value={perWeek}
            onChange={(e) => {
              setSaved(false)
              setPerWeek(e.target.value)
            }}
          />
        </label>
      </div>

      <fieldset>
        <legend className="text-sm font-semibold text-muted">Where they live</legend>
        <p className="mt-1 text-sm text-muted">
          Up to three places. Leave it empty if they live where you do.
        </p>
        <ul className="mt-2 flex flex-col gap-2">
          {places.map((p, i) => (
            <li key={i} className="flex flex-wrap items-end gap-2">
              <label className="min-w-56 flex-1 text-sm">
                Time zone {i + 1}
                <input
                  className={input}
                  list={ZONE_LIST_ID}
                  value={p.timezone}
                  onChange={(e) => edit(i, { timezone: e.target.value })}
                  autoComplete="off"
                  spellCheck={false}
                />
              </label>
              <label className="w-28 text-sm">
                Share (%)
                <input
                  className={input}
                  type="number"
                  min={1}
                  max={100}
                  inputMode="numeric"
                  value={p.share}
                  onChange={(e) => edit(i, { share: Number(e.target.value) || 1 })}
                />
              </label>
              <button
                type="button"
                className="min-h-10 rounded-control px-3 text-sm text-muted hover:bg-sunken hover:text-ink"
                onClick={() => {
                  setSaved(false)
                  setPlaces(places.filter((_, j) => j !== i))
                }}
                aria-label={`Remove time zone ${i + 1}`}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
        {places.length < MAX_PLACES && (
          <button
            type="button"
            className="mt-2 inline-flex min-h-10 items-center rounded-control border border-edge px-4 text-sm"
            onClick={() => {
              setSaved(false)
              setPlaces([...places, { timezone: '', share: places.length ? 30 : 100 }])
            }}
          >
            Add a place
          </button>
        )}
      </fieldset>

      <label className="text-sm">
        Your goal on {label}
        <textarea
          className={`${input} min-h-20 py-2`}
          maxLength={500}
          value={goal}
          placeholder="Find a job, grow my channel, learn in public…"
          onChange={(e) => {
            setSaved(false)
            setGoal(e.target.value)
          }}
        />
      </label>

      {problem && (
        <p role="alert" className="text-sm text-danger">
          {problem}
        </p>
      )}
      {save.isError && (
        <p role="alert" className="text-sm text-danger">
          {save.error.message}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className={primaryButton} disabled={!!problem || save.isPending}>
          {save.isPending ? 'Saving…' : `Save ${label} audience`}
        </button>
        <p role="status" className="text-sm text-muted">
          {saved && 'Saved.'}
        </p>
      </div>
      <BestHoursPreview platform={info.platform} label={label} />
    </form>
  )
}

/** Today's best hours left (or tomorrow's, late in the day), in the user's own time. */
function BestHoursPreview({ platform, label }: { platform: Platform; label: string }) {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  const hours = useBestHours(platform, today, 2)
  const day = hours.data?.days.find((d) => d.best.length)
  if (!day) return null
  const when = day.date === today ? 'Today' : 'Tomorrow'
  const list = day.best.map((h) => hourFormat.format(new Date(2000, 0, 1, h))).join(', ')
  return (
    <p className="rounded-control bg-sunken px-3 py-2 text-sm">
      <span className="font-semibold">
        {when}'s best hours for {label}:
      </span>{' '}
      {list}
      {hours.data?.source === 'your_posts' ? ' (from your own posts)' : ''}
    </p>
  )
}
