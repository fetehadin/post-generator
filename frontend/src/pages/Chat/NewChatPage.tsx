import { useId, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router'
import { useZone } from '../../api/me'
import { useCreateThread, useThreads } from '../../api/threads'
import { dateIn } from '../../lib/time'
import { useNeedsWelcome } from '../../lib/welcome'

const STARTERS = ['Today I shipped ', 'A lesson from this week: ', 'A problem I solved: ']

/**
 * A new chat (DESIGN.md §4.1, FR-6, FR-46): "What did you do today?" Save keeps it as today's
 * check-in and opens the chat; Generate also asks which platforms to write for. A failure
 * keeps the text exactly where it was (NFR-4).
 */
export function NewChatPage() {
  // The welcome's last step may hand over a suggested first topic.
  const handed = (useLocation().state as { text?: string } | null)?.text
  const [text, setText] = useState(handed ?? '')
  const needsWelcome = useNeedsWelcome()
  const [action, setAction] = useState<'save' | 'generate'>('generate')
  const zone = useZone()
  const create = useCreateThread()
  const navigate = useNavigate()
  const boxId = useId()
  const empty = !text.trim()

  function start(generate: boolean) {
    if (empty || create.isPending) return
    setAction(generate ? 'generate' : 'save')
    create.mutate(
      { text: text.trim(), day: dateIn(new Date(), zone) },
      {
        onSuccess: (t) => navigate(`/chat/${t.id}`, { state: generate ? { ask: true } : null }),
      },
    )
  }

  const today = new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: zone,
  }).format(new Date())

  if (needsWelcome) return <Navigate to="/welcome" replace />
  return (
    <div className="mx-auto max-w-column px-4 pt-12 pb-16 md:px-6 md:pt-[12vh]">
      <p className="text-sm text-muted">{today}</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">
        <label htmlFor={boxId}>What did you do today?</label>
      </h1>
      <form
        className="mt-8 rounded-panel border border-edge bg-surface p-3 focus-within:outline-2 focus-within:outline-thread"
        onSubmit={(e) => {
          e.preventDefault()
          if (!empty) start(true)
        }}
      >
        <textarea
          id={boxId}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) start(true)
          }}
          rows={3}
          placeholder="What you built, fixed or learned…"
          className="block w-full resize-none bg-transparent px-1 font-serif text-lg leading-writing outline-none [field-sizing:content] placeholder:text-muted"
        />
        <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            disabled={empty || create.isPending}
            onClick={() => start(false)}
            className="min-h-10 rounded-control border border-edge px-4 text-sm hover:bg-sunken disabled:opacity-50"
          >
            {create.isPending && action === 'save' ? 'Saving…' : 'Save'}
          </button>
          <button
            type="submit"
            disabled={empty || create.isPending}
            title="Ctrl+Enter"
            className="min-h-10 rounded-control bg-primary px-4 text-sm font-semibold text-on-primary disabled:opacity-50"
          >
            {create.isPending && action === 'generate' ? 'Saving…' : 'Generate'}
          </button>
        </div>
      </form>
      {create.error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {create.error.message} Your text is still here.
        </p>
      )}
      {empty && (
        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">Try:</span>
          {STARTERS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setText(s)
                document.getElementById(boxId)?.focus()
              }}
              className="min-h-9 rounded-full border border-edge px-3 hover:bg-sunken"
            >
              {s.replace(/[: ]+$/, '')}
            </button>
          ))}
        </div>
      )}
      <RecentChats />
      <p className="mt-12 text-sm">
        <Link to="/checkins" className="text-thread underline underline-offset-4">
          Past check-ins
        </Link>
      </p>
    </div>
  )
}

/** Mobile has no sidebar: the chat history sits under the box (DESIGN.md §2). */
function RecentChats() {
  const threads = useThreads().data?.items ?? []
  if (!threads.length) return null
  return (
    <section aria-labelledby="recent-chats" className="mt-12 md:hidden">
      <h2 id="recent-chats" className="text-sm font-semibold text-muted">
        Recent chats
      </h2>
      <ul className="mt-2">
        {threads.slice(0, 10).map((t) => (
          <li key={t.id}>
            <Link
              to={`/chat/${t.id}`}
              className="block min-h-11 truncate border-b border-line py-3 text-md"
            >
              {t.title}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
