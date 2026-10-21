import { useState } from 'react'
import { useReviseDraft } from '../../api/drafts'
import type { DraftDetail } from '../../api/types'

const QUICK = ['Shorter', 'Punchier', 'More casual', 'Add a hook']

type Props = {
  draft: DraftDetail
  selection: string
  clearSelection: () => void
  /** Saves a pending hand edit first, so the AI revises what the user sees. */
  beforeRevise: () => Promise<void>
}

/**
 * Feedback like a chat (DESIGN.md §4.2, FR-10, FR-40): what you asked and what changed, in
 * order. Each change is a new version. A selected part of the text scopes the next change.
 */
export function ChatPanel({ draft, selection, clearSelection, beforeRevise }: Props) {
  const [message, setMessage] = useState('')
  const revise = useReviseDraft(draft.id)

  async function send(instruction: string) {
    if (!instruction.trim() || revise.isPending) return
    await beforeRevise()
    await revise.mutateAsync({ instruction, ...(selection && { selection }) })
    setMessage('')
    clearSelection()
  }

  return (
    <section aria-label="Feedback" className="mt-8">
      <ol className="flex flex-col gap-3" aria-live="polite">
        {draft.topic && (
          <li className="self-end rounded-panel rounded-br-none bg-sunken px-4 py-2 text-sm">
            <span className="block text-xs text-muted">From your check-in</span>
            {draft.topic}
          </li>
        )}
        {draft.messages.map((m) =>
          m.role === 'user' ? (
            <li
              key={m.id}
              className="max-w-[85%] self-end rounded-panel rounded-br-none bg-sunken px-4 py-2 text-sm"
            >
              {m.text}
            </li>
          ) : (
            <li key={m.id} className="max-w-[85%] self-start text-sm text-muted">
              {m.version_id ? `Done. ${m.text}` : <span className="text-ink">{m.text}</span>}
            </li>
          ),
        )}
        {revise.isPending && <li className="self-start text-sm text-muted">Revising…</li>}
      </ol>

      <div className="mt-4 flex flex-wrap gap-2">
        {QUICK.map((q) => (
          <button
            key={q}
            type="button"
            disabled={revise.isPending}
            onClick={() => void send(q).catch(() => {})}
            className="min-h-9 rounded-full border border-line px-3 text-sm hover:border-edge disabled:text-muted"
          >
            {q}
          </button>
        ))}
      </div>

      <form
        className="mt-3 rounded-ask border border-edge bg-surface p-2 pl-4 focus-within:border-thread"
        onSubmit={(e) => {
          e.preventDefault()
          void send(message).catch(() => {})
        }}
      >
        {selection && (
          <p className="mb-1 flex items-center gap-2 text-xs text-muted">
            <span className="truncate">Only this part: “{selection}”</span>
            <button
              type="button"
              onClick={clearSelection}
              className="flex-none underline underline-offset-2"
            >
              Whole post
            </button>
          </p>
        )}
        <div className="flex items-end gap-2">
          <label htmlFor="feedback" className="sr-only">
            Tell it what to change
          </label>
          <textarea
            id="feedback"
            rows={1}
            maxLength={2000}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                e.currentTarget.form?.requestSubmit()
              }
            }}
            placeholder="Tell it what to change…"
            className="block max-h-40 min-h-10 flex-1 resize-none bg-transparent py-2 text-md outline-none [field-sizing:content] placeholder:text-muted"
          />
          <button
            type="submit"
            disabled={!message.trim() || revise.isPending}
            className="inline-flex min-h-10 items-center rounded-control bg-thread px-4 text-sm font-semibold text-on-thread disabled:cursor-not-allowed disabled:bg-sunken disabled:text-muted"
          >
            Revise
          </button>
        </div>
      </form>
      {revise.isError && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {revise.error.message}
        </p>
      )}
    </section>
  )
}
