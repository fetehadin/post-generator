import { useState } from 'react'
import { Link, useParams } from 'react-router'
import {
  type DraftChange,
  useDraft,
  useDraftPrompt,
  usePatchDraft,
  useRestoreVersion,
} from '../../api/drafts'
import { useMe } from '../../api/me'
import type { DraftDetail } from '../../api/types'
import { LengthCounter } from '../../components/LengthCounter'
import { PlatformMark } from '../../components/PlatformMark'
import { copyText, LINKEDIN_COMPOSER, xIntentUrl } from '../../lib/handoff'
import { LABEL, RULES, STATUS_LABEL } from '../../lib/platforms'
import { formatWhen } from '../../lib/time'
import { ApprovePanel } from './ApprovePanel'
import { ChatPanel } from './ChatPanel'
import { Preview } from './Preview'

/** The draft editor, `/drafts/:id` (DESIGN.md §4.2): the draft is the page. */
export function EditorPage() {
  const { id = '' } = useParams()
  const draft = useDraft(id)
  return (
    <div className="mx-auto max-w-[720px] px-4 pt-12 pb-16 md:px-6">
      {draft.isPending && <p className="text-muted">Loading…</p>}
      {draft.isError && (
        <p role="alert" className="text-danger">
          {draft.error.message}{' '}
          <Link to="/drafts" className="text-thread underline">
            Back to Drafts
          </Link>
        </p>
      )}
      {/* Keyed by the current version: the text box restarts from the server after each change. */}
      {draft.data && <Editor key={draft.data.versions.at(-1)?.id} draft={draft.data} />}
    </div>
  )
}

const tag = 'rounded-full border border-line px-2 text-xs text-muted'
const secondary =
  'inline-flex min-h-10 items-center rounded-control border border-edge px-4 text-sm disabled:text-muted'
const primary =
  'inline-flex min-h-10 items-center rounded-control bg-thread px-4 text-sm font-semibold text-on-thread disabled:cursor-not-allowed disabled:bg-sunken disabled:text-muted'

function Editor({ draft }: { draft: DraftDetail }) {
  const [text, setText] = useState(draft.text)
  const [view, setView] = useState<'edit' | 'preview'>('edit')
  const [selection, setSelection] = useState('')
  const [panel, setPanel] = useState<'none' | 'approve' | 'move' | 'versions'>('none')
  const [copied, setCopied] = useState<'' | 'yes' | 'no'>('')
  const patch = usePatchDraft(draft.id)
  const me = useMe()
  const name = (me.data?.email ?? '').split('@')[0] || 'You'

  const editable = draft.status === 'draft'
  const dirty = text.trim() !== draft.text
  const label = LABEL[draft.platform]

  async function saveText() {
    if (editable && dirty && text.trim()) await patch.mutateAsync({ text })
  }

  function change(c: DraftChange) {
    patch.mutate(c, { onSuccess: () => setPanel('none') })
  }

  async function handOff() {
    if (draft.platform === 'x') {
      window.open(xIntentUrl(draft.text), '_blank', 'noopener')
      return
    }
    const ok = await copyText(draft.text)
    setCopied(ok ? 'yes' : 'no')
    if (draft.platform === 'linkedin') window.open(LINKEDIN_COMPOSER, '_blank', 'noopener')
  }

  return (
    <article aria-label={`${label} draft`}>
      <div className="flex flex-wrap items-center gap-2">
        <Link
          to="/drafts"
          className="mr-1 text-sm text-muted hover:text-ink"
          aria-label="Back to Drafts"
        >
          ←
        </Link>
        <PlatformMark platform={draft.platform} />
        <h1 className="font-semibold">{label} draft</h1>
        <span className={tag}>{STATUS_LABEL[draft.status]}</span>
        <div className="ml-auto flex items-center gap-1">
          <div
            role="group"
            aria-label="View"
            className="flex rounded-control border border-line p-0.5"
          >
            {(['edit', 'preview'] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => setView(v)}
                className={`min-h-8 rounded-control px-3 text-sm ${view === v ? 'bg-sunken font-semibold' : 'text-muted'}`}
              >
                {v === 'edit' ? 'Edit' : 'Preview'}
              </button>
            ))}
          </div>
          <button
            type="button"
            aria-expanded={panel === 'versions'}
            onClick={() => setPanel(panel === 'versions' ? 'none' : 'versions')}
            className="min-h-9 rounded-control px-3 text-sm text-muted hover:bg-sunken"
          >
            Versions ({draft.versions.length})
          </button>
        </div>
      </div>

      <div className="mt-6">
        {view === 'preview' ? (
          <Preview platform={draft.platform} text={text} name={name} />
        ) : (
          <>
            <label htmlFor="draft-text" className="sr-only">
              {label} draft text
            </label>
            <textarea
              id="draft-text"
              value={text}
              readOnly={!editable}
              onChange={(e) => setText(e.target.value)}
              onBlur={() => void saveText().catch(() => {})}
              onSelect={(e) => {
                const t = e.currentTarget
                const picked = t.value.slice(t.selectionStart, t.selectionEnd).trim()
                if (picked.length > 2 && !dirty) setSelection(picked)
              }}
              className="-ml-4 block min-h-40 w-[calc(100%+1rem)] resize-y border-l-2 border-transparent bg-transparent pl-4 font-serif text-lg leading-[1.7] outline-none [field-sizing:content] hover:border-line focus:border-thread read-only:hover:border-transparent"
            />
          </>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-3">
        <LengthCounter text={text} rule={RULES[draft.platform]} limit={draft.length.limit} />
        <span className="text-xs text-muted" role="status">
          {patch.isPending ? 'Saving…' : dirty && editable ? 'Unsaved' : ''}
        </span>
        <span className={tag}>AI draft</span>
      </div>

      {patch.isError && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {patch.error.message}
        </p>
      )}

      {panel === 'versions' && <Versions draft={draft} onDone={() => setPanel('none')} />}

      {draft.status === 'draft' && (
        <>
          {panel === 'approve' ? (
            <ApprovePanel
              draft={draft}
              mode="approve"
              pending={patch.isPending}
              onSave={change}
              onCancel={() => setPanel('none')}
            />
          ) : (
            <div className="mt-6 flex flex-wrap items-center gap-2">
              <button
                type="button"
                className={primary}
                disabled={dirty || draft.length.over}
                onClick={() => setPanel('approve')}
              >
                Approve and schedule…
              </button>
              {draft.length.over && (
                <span className="text-sm text-danger">
                  Over the {label} limit: cut {draft.length.count - draft.length.limit} characters
                  to approve.
                </span>
              )}
              {dirty && !draft.length.over && (
                <button
                  type="button"
                  className={secondary}
                  onClick={() => void saveText().catch(() => {})}
                >
                  Save edit
                </button>
              )}
              <button
                type="button"
                className="ml-auto min-h-10 px-3 text-sm text-muted hover:text-danger"
                onClick={() => change({ status: 'discarded' })}
              >
                Discard
              </button>
            </div>
          )}
          <ChatPanel
            draft={draft}
            selection={selection}
            clearSelection={() => setSelection('')}
            beforeRevise={saveText}
          />
        </>
      )}

      {draft.status === 'approved' && (
        <>
          <p className="mt-6 text-sm">
            <b>Approved.</b>{' '}
            {draft.scheduled_for
              ? `On your calendar for ${formatWhen(draft.scheduled_for)}.`
              : 'Not on the calendar yet.'}
          </p>
          {panel === 'move' ? (
            <ApprovePanel
              draft={draft}
              mode="move"
              pending={patch.isPending}
              onSave={change}
              onCancel={() => setPanel('none')}
            />
          ) : (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button type="button" className={primary} onClick={() => void handOff()}>
                {draft.platform === 'x'
                  ? 'Open in X'
                  : draft.platform === 'linkedin'
                    ? 'Copy and open LinkedIn'
                    : 'Copy text'}
              </button>
              <button type="button" className={secondary} onClick={() => setPanel('move')}>
                {draft.scheduled_for ? 'Change the time…' : 'Schedule…'}
              </button>
              <button
                type="button"
                className={secondary}
                onClick={() => change({ status: 'published' })}
              >
                I posted it
              </button>
              <button
                type="button"
                className="ml-auto min-h-10 px-3 text-sm text-muted hover:text-ink"
                onClick={() => change({ status: 'draft' })}
              >
                Back to draft
              </button>
            </div>
          )}
          <p className="mt-2 text-sm text-muted" role="status">
            {copied === 'yes' && 'Copied.'}
            {copied === 'no' && "Couldn't copy: select the text and copy it by hand."}
          </p>
        </>
      )}

      {draft.status === 'published' && draft.published_at && (
        <p className="mt-6 text-sm">
          <b>Posted</b> {formatWhen(draft.published_at)}.
        </p>
      )}

      {draft.status === 'discarded' && (
        <div className="mt-6 flex items-center gap-3 text-sm">
          <span>Discarded.</span>
          <button type="button" className={secondary} onClick={() => change({ status: 'draft' })}>
            Restore to draft
          </button>
        </div>
      )}

      {import.meta.env.DEV && <PromptDebug id={draft.id} />}
    </article>
  )
}

/** Every version with what made it; restore one in a click (FR-10). */
function Versions({ draft, onDone }: { draft: DraftDetail; onDone: () => void }) {
  const restore = useRestoreVersion(draft.id)
  const current = draft.versions.at(-1)?.id
  return (
    <section aria-label="Versions" className="mt-6 rounded-panel border border-line bg-paper p-4">
      <ol className="flex flex-col gap-4">
        {[...draft.versions].reverse().map((v) => (
          <li key={v.id} className="text-sm">
            <div className="flex items-center gap-2">
              <b>v{v.number}</b>
              <span className="text-muted">{v.instruction ?? 'First draft'}</span>
              {v.id === current ? (
                <span className={`${tag} ml-auto`}>Current</span>
              ) : (
                draft.status === 'draft' && (
                  <button
                    type="button"
                    disabled={restore.isPending}
                    onClick={() => restore.mutate(v.id, { onSuccess: onDone })}
                    className="ml-auto min-h-8 rounded-control border border-edge px-3"
                  >
                    Restore
                  </button>
                )
              )}
            </div>
            <p className="mt-1 line-clamp-3 font-serif whitespace-pre-wrap text-muted">{v.text}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}

/** Developers only: the exact prompt (NFR-15). Production builds drop it (import.meta.env.DEV). */
function PromptDebug({ id }: { id: string }) {
  const [open, setOpen] = useState(false)
  const log = useDraftPrompt(id, open)
  return (
    <details className="mt-10 text-xs text-muted" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="cursor-pointer">Prompt (developer view)</summary>
      {log.data && (
        <pre className="mt-2 max-h-96 overflow-auto rounded-control bg-sunken p-3 whitespace-pre-wrap">
          {log.data.prompt}
        </pre>
      )}
    </details>
  )
}
