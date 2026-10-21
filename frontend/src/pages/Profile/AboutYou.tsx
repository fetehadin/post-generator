import { useState } from 'react'
import {
  type Profile,
  type ProfileChange,
  useProfile,
  useSaveProfile,
  useWriteSummary,
} from '../../api/profile'

type TextField = Exclude<
  keyof Profile,
  'language' | 'excluded_hashtags' | 'summary_card' | 'summary_updated_at'
>

/** The About-you questions, grouped the way people think about themselves (FR-17, FR-33). */
const GROUPS: Array<{ title: string; fields: Array<[TextField, string, string]> }> = [
  {
    title: 'Your work',
    fields: [
      ['role', 'Role', 'Backend developer, student, founder…'],
      ['stack', 'Stack and tools', 'Python, FastAPI, Postgres'],
      ['current_projects', 'Current projects', 'What you are building now'],
      ['focus', 'Focus', 'What you are getting better at'],
    ],
  },
  {
    title: 'Your posts',
    fields: [
      ['goal', 'Why you post', 'Find a job, grow a community, learn in public…'],
      ['topics', 'Topics', 'What you usually write about'],
      ['audience', 'Audience', 'Who reads you, and where'],
      ['usual_hours', 'When you usually post', 'Weekday evenings'],
    ],
  },
  {
    title: 'Your voice',
    fields: [
      ['voice_words', 'Three words for your voice', 'Honest, short, a bit funny'],
      ['avoid_list', 'Never say', 'Words, topics or claims to avoid'],
      ['links', 'Links', 'GitHub, portfolio, channel'],
      ['discipline', 'Field', 'Software, design, research…'],
    ],
  },
]

const LANGUAGES: Array<[string, string]> = [
  ['auto', 'Same as my posts'],
  ['English', 'English'],
  ['Amharic', 'Amharic'],
]

const input =
  'mt-1 block min-h-10 w-full rounded-control border border-edge bg-surface px-3 text-sm'

/** Profile → About you: the answers, then the summary card every draft may use (FR-18). */
export function AboutYou() {
  const profile = useProfile()
  if (profile.isPending) return <p className="mt-4 text-sm text-muted">Loading…</p>
  if (profile.isError)
    return (
      <p role="alert" className="mt-4 text-danger">
        {profile.error.message}
      </p>
    )
  // Keyed by the saved time so the form starts from the server copy after each AI rewrite.
  return <AboutForm key={profile.data.summary_updated_at ?? 'new'} saved={profile.data} />
}

function AboutForm({ saved }: { saved: Profile }) {
  const [form, setForm] = useState(saved)
  const [tags, setTags] = useState(saved.excluded_hashtags.join(', '))
  const save = useSaveProfile()
  const summary = useWriteSummary()

  const answers = (): ProfileChange => {
    const change: ProfileChange = {}
    for (const g of GROUPS) for (const [name] of g.fields) change[name] = form[name]
    change.language = form.language
    change.excluded_hashtags = tags
      .split(/[\s,]+/)
      .map((t) => t.trim())
      .filter(Boolean)
    return change
  }

  async function writeCard() {
    // The card is written from the saved answers, so save what was typed first.
    await save.mutateAsync(answers())
    summary.mutate()
  }

  const busy = save.isPending || summary.isPending
  const error = save.error ?? summary.error

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        save.mutate({ ...answers(), summary_card: form.summary_card })
      }}
      className="mt-4 flex flex-col gap-8"
    >
      {GROUPS.map((g) => (
        <fieldset key={g.title}>
          <legend className="text-sm font-semibold text-muted">{g.title}</legend>
          <div className="mt-2 grid gap-4 sm:grid-cols-2">
            {g.fields.map(([name, label, hint]) => (
              <label key={name} className="text-sm">
                {label}
                <input
                  value={form[name]}
                  onChange={(e) => setForm({ ...form, [name]: e.target.value })}
                  placeholder={hint}
                  className={input}
                />
              </label>
            ))}
          </div>
        </fieldset>
      ))}

      <fieldset>
        <legend className="text-sm font-semibold text-muted">Language and privacy</legend>
        <div className="mt-2 grid gap-4 sm:grid-cols-2">
          <label className="text-sm">
            Write drafts in
            <select
              value={form.language}
              onChange={(e) => setForm({ ...form, language: e.target.value })}
              className={input}
            >
              {LANGUAGES.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Skip posts with these hashtags
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="#family, #me"
              className={input}
            />
          </label>
        </div>
      </fieldset>

      <section aria-labelledby="card" className="rounded-panel border border-line bg-paper p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="card" className="font-semibold">
            Summary card
          </h3>
          <button
            type="button"
            onClick={writeCard}
            disabled={busy}
            className="inline-flex min-h-10 items-center rounded-control border border-edge px-4 text-sm disabled:text-muted"
          >
            {summary.isPending
              ? 'Writing…'
              : form.summary_card
                ? 'Rewrite from my answers'
                : 'Write it from my answers'}
          </button>
        </div>
        <p className="mt-1 text-sm text-muted">
          Drafts may only state facts from this card and what you tell Voxlace that day. Edit it
          freely.
        </p>
        <label htmlFor="summary-card" className="sr-only">
          Summary card text
        </label>
        <textarea
          id="summary-card"
          value={form.summary_card}
          onChange={(e) => setForm({ ...form, summary_card: e.target.value })}
          placeholder="Answer a few questions above, then let Voxlace write this, or write it yourself."
          className="mt-3 block min-h-32 w-full resize-y rounded-control border border-edge bg-surface p-3 font-serif text-md leading-[1.7] [field-sizing:content]"
        />
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="inline-flex min-h-10 items-center rounded-control bg-thread px-4 text-sm font-semibold text-on-thread disabled:cursor-not-allowed disabled:bg-sunken disabled:text-muted"
        >
          {save.isPending ? 'Saving…' : 'Save profile'}
        </button>
        <span role="status" className="text-sm text-muted">
          {save.isSuccess && !busy ? 'Saved' : ''}
        </span>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error.message}
          </p>
        )}
      </div>
    </form>
  )
}
