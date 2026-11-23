import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { useZone } from '../../api/me'
import { useProfile } from '../../api/profile'
import { useCreateThread, useThreads } from '../../api/threads'
import type { Platform } from '../../api/types'
import { type Command, Composer } from '../../components/Composer'
import { DropdownMenuItem } from '../../components/ui/dropdown-menu'
import { savedPlatforms, savePlatforms } from '../../lib/platformChoice'
import { LABEL, PLATFORMS } from '../../lib/platforms'
import { starterLabel, startersFor } from '../../lib/starters'
import { dateIn } from '../../lib/time'
import { chip } from '../../lib/ui'

const BOX = 'new-chat-box'

/**
 * A new chat, and the first run (DESIGN.md §4.1, §4.5, FR-6, FR-46): "What did you do today?" Enter writes drafts for
 * the platforms picked in the box, straight away; Options → "Save as a check-in" only saves
 * it. A failure keeps the text exactly where it was (NFR-4).
 */
export function NewChatPage() {
  // The welcome's last step may hand over a suggested first topic.
  const location = useLocation()
  const handed = (location.state as { text?: string } | null)?.text
  const [text, setText] = useState(handed ?? '')
  const [platforms, setPlatforms] = useState<Platform[]>(savedPlatforms)
  const profession = useProfile().data?.discipline
  const threads = useThreads().data?.items
  const zone = useZone()
  const create = useCreateThread()
  const navigate = useNavigate()
  const empty = !text.trim()
  const firstTime = threads !== undefined && threads.length === 0

  function start(write: Platform[] | null) {
    if (empty || create.isPending) return
    if (write) savePlatforms(write)
    create.mutate(
      { text: text.trim(), day: dateIn(new Date(), zone) },
      // The chat writes the drafts as it opens: no second "which platforms?" step.
      { onSuccess: (t) => navigate(`/chat/${t.id}`, { state: write ? { write } : null }) },
    )
  }

  const commands: Command[] = [
    ...PLATFORMS.map((p) => ({
      name: p === 'x' ? 'x' : p,
      hint: `Write for ${LABEL[p]} only`,
      run: () => setPlatforms([p]),
    })),
    { name: 'all', hint: 'Write for every platform', run: () => setPlatforms([...PLATFORMS]) },
    { name: 'save', hint: 'Save as a check-in, no drafts', run: () => start(null) },
  ]

  // Used once: drop it from history, so Back or a reload doesn't suggest it again.
  useEffect(() => {
    if (handed) navigate(location.pathname, { replace: true, state: null })
  }, [handed, location.pathname, navigate])

  return (
    <div className="mx-auto max-w-column px-4 pt-12 pb-16 md:px-6 md:pt-[22vh]">
      <h1 className="text-center text-2xl font-semibold tracking-tight text-balance">
        <label htmlFor={BOX}>What did you do today?</label>
      </h1>
      {firstTime && (
        <p className="mt-2 text-center text-muted">
          One line is enough. You'll get a draft to edit in seconds.
        </p>
      )}
      <div className="mt-8">
        <Composer
          id={BOX}
          value={text}
          onChange={setText}
          onSubmit={() => start(platforms)}
          canSubmit={!empty && platforms.length > 0}
          busy={create.isPending}
          placeholder="What you made, fixed or learned…"
          sendLabel={
            platforms.length === 1 ? `Write a ${LABEL[platforms[0]]} draft` : 'Write drafts'
          }
          platforms={{ value: platforms, onChange: setPlatforms }}
          commands={commands}
          menu="below"
          rows={2}
          options={
            <>
              <DropdownMenuItem disabled={empty} onSelect={() => start(null)}>
                Save as a check-in, no drafts
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => navigate('/checkins')}>
                Past check-ins
              </DropdownMenuItem>
            </>
          }
        />
      </div>
      {create.isPending && (
        <p aria-live="polite" className="mt-3 text-center text-sm text-muted">
          Saving your check-in…
        </p>
      )}
      {create.error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {create.error.message} Your text is still here.
        </p>
      )}
      {empty && (
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          {startersFor(profession).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setText(s)
                document.getElementById(BOX)?.focus()
              }}
              className={chip}
            >
              {starterLabel(s)}
            </button>
          ))}
        </div>
      )}
      {platforms.length === 0 && (
        <p className="mt-3 text-center text-sm text-muted">Pick at least one platform.</p>
      )}
      <RecentChats />
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
      <Link
        to="/checkins"
        className="mt-3 inline-block text-sm text-thread underline underline-offset-4"
      >
        Past check-ins
      </Link>
    </section>
  )
}
