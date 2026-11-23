import { useState } from 'react'
import { input } from './fields'
import {
  AUDIENCE_KINDS,
  MAIN_GOALS,
  PROFESSION_LIST_ID,
  PROFESSION_SUGGESTIONS,
} from '../../lib/profession'
import {
  type Profile,
  type ProfileChange,
  type Project,
  useProfile,
  useSaveProfile,
  useWriteSummary,
} from '../../api/profile'

type TextField = Exclude<
  keyof Profile,
  | 'language'
  | 'excluded_hashtags'
  | 'summary_card'
  | 'summary_updated_at'
  | 'projects'
  | 'audience_kind'
  | 'main_goal'
>

/** The About-you questions, grouped the way people think about themselves (FR-17, FR-33). */
const GROUPS: Array<{
  title: string
  open?: boolean
  fields: Array<[TextField, string, string]>
}> = [
  {
    title: 'The basics',
    open: true,
    fields: [
      ['discipline', 'Profession', 'Teacher, nurse, designer, developer…'],
      ['current_projects', 'What you are working on', 'A course, a clinic, an app, a book…'],
      ['focus', 'What you are getting better at', 'Public speaking, design, sales…'],
    ],
  },
  {
    title: 'Your work',
    fields: [
      ['role', 'Role or title', 'Head of science, founder, nurse manager…'],
      ['seniority', 'Experience', 'Student, early career, senior…'],
      ['stack', 'Tools you use', 'Figma, Excel, Canva, Python…'],
      ['portfolio_url', 'Website or portfolio', 'https://yoursite.com'],
    ],
  },
  {
    title: 'Your posts',
    fields: [
      ['goal', 'Why you post', 'Find work, grow a community, share what you learn…'],
      ['topics', 'Topics', 'What you usually write about'],
      ['audience', 'Audience', 'Who reads you, and where'],
      ['usual_hours', 'When you usually post', 'Weekday evenings'],
      ['facts', 'Facts drafts may use', 'Numbers, results, dates you are happy to share'],
    ],
  },
  {
    title: 'Your voice',
    fields: [
      ['voice_words', 'Three words for your voice', 'Honest, short, a bit funny'],
      ['emoji_habit', 'Emoji', 'None, one at the end, lots…'],
      ['hashtag_habit', 'Hashtags', 'Never, two at the end…'],
      ['avoid_list', 'Never say', 'Words, topics or claims to avoid'],
      ['links', 'Links', 'Your site, portfolio, channel'],
    ],
  },
]

const STATUSES: Array<[Project['status'], string]> = [
  ['', 'No status'],
  ['idea', 'Idea'],
  ['building', 'Building'],
  ['live', 'Live'],
  ['paused', 'Paused'],
]
const NEW_PROJECT: Project = { name: '', line: '', link: '', status: '' }

const LANGUAGES: Array<[string, string]> = [
  ['auto', 'Same as my posts'],
  ['English', 'English'],
  ['Amharic', 'Amharic'],
]

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
    change.projects = form.projects
      .map((p) => ({ ...p, name: p.name.trim() }))
      .filter((p) => p.name)
    change.audience_kind = form.audience_kind
    change.main_goal = form.main_goal
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

  const setProject = (i: number, change: Partial<Project>) =>
    setForm({
      ...form,
      projects: form.projects.map((p, j) => (j === i ? { ...p, ...change } : p)),
    })

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
        // Progressive disclosure: the basics are open, the rest fold away with a count.
        <Section
          key={g.title}
          title={g.title}
          open={g.open}
          filled={g.fields.filter(([n]) => String(form[n] ?? '').trim()).length}
        >
          <fieldset>
            <legend className="sr-only">{g.title}</legend>
            <div className="mt-2 grid gap-4 sm:grid-cols-2">
              {g.fields.map(([name, label, hint]) => (
                <label key={name} className="text-sm">
                  {label}
                  <input
                    value={form[name]}
                    onChange={(e) => setForm({ ...form, [name]: e.target.value })}
                    placeholder={hint}
                    list={name === 'discipline' ? PROFESSION_LIST_ID : undefined}
                    className={input}
                  />
                </label>
              ))}
              {g.title === 'Your posts' && (
                <>
                  <label className="text-sm">
                    Writing mostly for
                    <select
                      value={form.audience_kind}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          audience_kind: e.target.value as Profile['audience_kind'],
                        })
                      }
                      className={input}
                    >
                      {AUDIENCE_KINDS.map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm">
                    Main goal
                    <select
                      value={form.main_goal}
                      onChange={(e) =>
                        setForm({ ...form, main_goal: e.target.value as Profile['main_goal'] })
                      }
                      className={input}
                    >
                      {MAIN_GOALS.map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}
            </div>
          </fieldset>
        </Section>
      ))}

      <Section title="Projects" filled={form.projects.filter((x) => x.name.trim()).length}>
        <fieldset>
          <legend className="sr-only">Projects</legend>
          <p className="mt-1 text-sm text-muted">
            When you have more than one, the chat asks which one you mean.
          </p>
          <ul className="mt-2 flex flex-col gap-3">
            {form.projects.map((p, i) => (
              <li
                key={i}
                className="grid gap-2 rounded-control border border-line p-3 sm:grid-cols-2"
              >
                <label className="text-sm">
                  Project name
                  <input
                    value={p.name}
                    onChange={(e) => setProject(i, { name: e.target.value })}
                    placeholder="Voxlace"
                    className={input}
                  />
                </label>
                <label className="text-sm">
                  Status
                  <select
                    value={p.status}
                    onChange={(e) => setProject(i, { status: e.target.value as Project['status'] })}
                    className={input}
                  >
                    {STATUSES.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  In one line
                  <input
                    value={p.line}
                    onChange={(e) => setProject(i, { line: e.target.value })}
                    placeholder="What it does"
                    className={input}
                  />
                </label>
                <label className="text-sm">
                  Link
                  <input
                    value={p.link}
                    onChange={(e) => setProject(i, { link: e.target.value })}
                    placeholder="https://"
                    className={input}
                  />
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setForm({ ...form, projects: form.projects.filter((_, j) => j !== i) })
                  }
                  className="justify-self-start text-sm text-muted underline"
                >
                  Remove {p.name || 'this project'}
                </button>
              </li>
            ))}
          </ul>
          {form.projects.length < 20 && (
            <button
              type="button"
              onClick={() => setForm({ ...form, projects: [...form.projects, NEW_PROJECT] })}
              className="mt-2 inline-flex min-h-10 items-center rounded-full border border-edge px-4 text-sm"
            >
              Add a project
            </button>
          )}
        </fieldset>
      </Section>

      <Section title="Language and privacy">
        <fieldset>
          <legend className="sr-only">Language and privacy</legend>
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
      </Section>

      <section aria-labelledby="card" className="rounded-panel border border-line bg-paper p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="card" className="font-semibold">
            Summary card
          </h3>
          <button
            type="button"
            onClick={writeCard}
            disabled={busy}
            className="inline-flex min-h-10 items-center rounded-full border border-edge px-4 text-sm disabled:text-muted"
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
          className="mt-3 block min-h-32 w-full resize-y rounded-control border border-edge bg-surface p-3 text-md leading-[1.7] [field-sizing:content]"
        />
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="inline-flex min-h-10 items-center rounded-full bg-primary px-4 text-sm font-semibold text-on-primary disabled:cursor-not-allowed disabled:bg-sunken disabled:text-muted"
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
      <datalist id={PROFESSION_LIST_ID}>
        {PROFESSION_SUGGESTIONS.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>
    </form>
  )
}

/** A folded group of answers; says how many are filled so nothing feels lost. */
function Section({
  title,
  open = false,
  filled,
  children,
}: {
  title: string
  open?: boolean
  filled?: number
  children: React.ReactNode
}) {
  if (open)
    return (
      <div>
        <h3 className="text-sm font-semibold text-muted">{title}</h3>
        {children}
      </div>
    )
  return (
    <details className="group rounded-panel border border-line px-4 py-1 open:pb-4">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-semibold">
        <span
          className="transition-transform duration-(--duration) group-open:rotate-90"
          aria-hidden="true"
        >
          ›
        </span>
        {title}
        {filled !== undefined && (
          <span className="ml-auto font-normal text-muted">
            {filled ? `${filled} filled` : 'Optional'}
          </span>
        )}
      </summary>
      {children}
    </details>
  )
}
