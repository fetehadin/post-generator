import { Link, useParams } from 'react-router'
import { useThread } from '../../api/threads'
import type { DraftRow, Thread, ThreadMessage } from '../../api/types'
import { LengthCounter } from '../../components/LengthCounter'
import { PlatformMark } from '../../components/PlatformMark'
import { LABEL, RULES, STATUS_LABEL } from '../../lib/platforms'

/**
 * One chat thread (DESIGN.md §4.1, FR-40, FR-46): the check-in, then a card for every draft
 * version in order. A draft's newest card is shown in full; older cards fold to their first
 * line. Replying, quick changes and approve-with-a-day arrive with the chat board (PR 4);
 * until then each card opens the draft's editor.
 */
export function ThreadPage() {
  const { id } = useParams()
  const thread = useThread(id)
  return (
    <div className="mx-auto max-w-column px-4 py-12 md:px-6 md:py-16">
      {thread.isPending ? (
        <p className="text-muted">Loading the chat…</p>
      ) : thread.isError ? (
        <p role="alert" className="text-danger">
          {thread.error.message}{' '}
          <Link to="/" className="text-thread underline underline-offset-4">
            Start a new chat
          </Link>
        </p>
      ) : (
        <ThreadView thread={thread.data} />
      )}
    </div>
  )
}

function ThreadView({ thread }: { thread: Thread }) {
  const byId = new Map(thread.drafts.map((d) => [d.id, d]))
  // The newest card of each draft is the one shown open.
  const newest = new Map<string, string>()
  for (const m of thread.messages) if (m.card && m.draft_id) newest.set(m.draft_id, m.id)
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">{thread.title}</h1>
      <ol className="mt-8 flex flex-col gap-4">
        {thread.messages.map((m) => (
          <li key={m.id}>
            {m.card && m.draft_id && byId.has(m.draft_id) ? (
              <Card
                message={m}
                draft={byId.get(m.draft_id)!}
                open={newest.get(m.draft_id) === m.id}
              />
            ) : (
              <Plain message={m} />
            )}
          </li>
        ))}
      </ol>
    </>
  )
}

function Plain({ message }: { message: ThreadMessage }) {
  if (!message.text) return null
  return message.role === 'user' ? (
    <p className="ml-auto max-w-[85%] rounded-panel bg-sunken px-4 py-3 font-serif text-lg leading-writing whitespace-pre-wrap">
      <span className="sr-only">You: </span>
      {message.text}
    </p>
  ) : (
    <p className="text-muted">{message.text}</p>
  )
}

function Card({
  message,
  draft,
  open,
}: {
  message: ThreadMessage
  draft: DraftRow
  open: boolean
}) {
  const card = message.card!
  const name = `${LABEL[draft.platform]} draft · v${card.number}`
  const firstLine = card.text.split('\n').find((l) => l.trim()) ?? ''
  if (!open)
    return (
      <p className="flex items-center gap-2 rounded-panel bg-sunken px-4 py-2 text-sm text-muted">
        <PlatformMark platform={draft.platform} />
        <span className="flex-none">{name}</span>
        <span className="min-w-0 truncate font-serif">{firstLine}</span>
      </p>
    )
  return (
    <article aria-label={name} className="rounded-panel border border-line bg-surface p-4">
      <header className="flex flex-wrap items-center gap-2 text-sm">
        <PlatformMark platform={draft.platform} />
        <span className="font-semibold">{name}</span>
        <span className="rounded-full border border-line px-2 text-xs text-muted">
          {STATUS_LABEL[draft.status]}
        </span>
      </header>
      <p className="mt-3 font-serif text-lg leading-writing whitespace-pre-wrap">{card.text}</p>
      <footer className="mt-3 flex flex-wrap items-center gap-3">
        <LengthCounter text={card.text} rule={RULES[draft.platform]} limit={card.length.limit} />
        <span className="rounded-full border border-thread px-2 text-xs text-thread">AI draft</span>
        <Link
          to={`/drafts/${draft.id}`}
          className="ml-auto text-sm text-thread underline underline-offset-4"
        >
          Open the editor
        </Link>
      </footer>
    </article>
  )
}
