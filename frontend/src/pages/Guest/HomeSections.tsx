import { Link } from 'react-router'
import type { Platform } from '../../api/types'
import { Wordmark } from '../../components/Logo'
import { PlatformMark } from '../../components/PlatformMark'
import { LABEL } from '../../lib/platforms'
import { secondary } from '../../lib/ui'

/**
 * Everything on the homepage below the live demo (FR-50, DESIGN.md §4.6): how it works,
 * where it posts, free to start, a short FAQ and the footer. Every sentence here must match
 * what the app does today; change it in the same PR as the behaviour.
 */

const STEPS = [
  ['Say what you did', 'One line about your day is enough. No blank page, no prompt to write.'],
  [
    'Get a draft per platform',
    'X, LinkedIn and Telegram each get their own draft, sized for that platform.',
  ],
  [
    'Edit, approve, post',
    'Ask for changes in plain words. Nothing is posted until you approve it.',
  ],
] as const

const WHERE: Record<Platform, string> = {
  x: 'Opens X with your text in the post box. You press Post.',
  linkedin: 'Copies your text and opens LinkedIn. You paste and post.',
  telegram:
    'Copies your text and opens your channel, or connect the Voxlace bot and it posts approved drafts at the time you pick.',
}

const FAQ = [
  [
    'Does Voxlace ever post without me?',
    'No. Nothing is posted until you approve it. X and LinkedIn open with your text ready and you press post yourself. The Telegram bot posts only drafts you approved, at the time you chose.',
  ],
  [
    'How does it sound like me?',
    'Import the posts you already wrote: X, LinkedIn and Telegram all let you download them. Voxlace uses them as examples of your style when it writes. No AI model is trained on them. You can exclude any of them, or delete all your data at any time.',
  ],
  [
    'Do you need my social media passwords?',
    'Never. You upload the export file the platform gives you, and for Telegram you add our bot to your channel yourself.',
  ],
  [
    'Is it free?',
    'Yes, with a daily number of free drafts. If you need more, create an account and add your own free AI key, for example from Google Gemini or Groq.',
  ],
  [
    'Will it make things up?',
    'Drafts are told to use only what you give them: your check-in, your profile and what you choose to share. If something reads wrong, ask for a change or edit it by hand.',
  ],
] as const

export function HomeSections() {
  return (
    <>
      <section aria-labelledby="how-title" className="mt-20">
        <h2 id="how-title" className="text-xl font-semibold tracking-tight">
          How it works
        </h2>
        <ol className="mt-6 grid gap-6 sm:grid-cols-3">
          {STEPS.map(([title, text], i) => (
            <li key={title}>
              <span className="text-sm text-muted tabular-nums">{i + 1}</span>
              <h3 className="mt-1 font-semibold">{title}</h3>
              <p className="mt-1 text-sm text-muted">{text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="where-title" className="mt-20">
        <h2 id="where-title" className="text-xl font-semibold tracking-tight">
          Where it posts
        </h2>
        <ul className="mt-6 divide-y divide-line border-y border-line">
          {(Object.keys(WHERE) as Platform[]).map((p) => (
            <li key={p} className="flex gap-3 py-4">
              <span className="mt-0.5 flex-none">
                <PlatformMark platform={p} />
              </span>
              <p className="text-sm">
                <span className="font-semibold">{LABEL[p]}.</span>{' '}
                <span className="text-muted">{WHERE[p]}</span>
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="free-title" className="mt-20">
        <h2 id="free-title" className="text-xl font-semibold tracking-tight">
          Free to start
        </h2>
        <p className="mt-2 text-muted">
          Try it above without an account. Create one to keep your drafts, learn your voice from
          your own posts, and plan them on a calendar.
        </p>
        <Link to="/login" state={{ mode: 'signup' }} className={`${secondary} mt-4`}>
          Create a free account
        </Link>
      </section>

      <section aria-labelledby="faq-title" className="mt-20">
        <h2 id="faq-title" className="text-xl font-semibold tracking-tight">
          Questions
        </h2>
        <div className="mt-4 divide-y divide-line border-y border-line">
          {FAQ.map(([q, a]) => (
            <details key={q} className="group py-1">
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 rounded-control font-semibold [&::-webkit-details-marker]:hidden">
                {q}
                <span
                  aria-hidden
                  className="flex-none text-muted transition-transform duration-(--duration) group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <p className="pb-4 text-muted">{a}</p>
            </details>
          ))}
        </div>
      </section>

      <footer className="mt-20 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-6 pb-10 text-sm text-muted">
        <Wordmark className="h-4 w-auto text-ink" />
        <p>Drafts in your voice. You approve every post.</p>
        <Link to="/login" className="underline underline-offset-4 hover:text-ink">
          Log in
        </Link>
      </footer>
    </>
  )
}
