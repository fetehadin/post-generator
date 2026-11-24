import { useState } from 'react'
import { Link } from 'react-router'
import { useMe, useNotifications } from '../api/me'
import { useScheduleDraft } from '../api/threads'
import type { DraftRow, Notifications } from '../api/types'
import { LABEL } from '../lib/platforms'
import { formatShort } from '../lib/time'
import { useHandOff } from '../lib/useHandOff'
import { HandOffPrompt } from './HandOffPrompt'
import { WhenPicker } from './WhenPicker'
import { PlatformMark } from './PlatformMark'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover'

/** How many things need action: the bell's number. */
export const needsAction = (n?: Notifications) =>
  n ? n.due.length + n.missed.length + (n.checkin_reminder ? 1 : 0) : 0

/**
 * Notifications and Missed (DESIGN.md §2, FR-35, FR-42): posts due now, today's check-in
 * reminder, and approved posts whose time passed. Nothing is ever posted from here without a
 * click; each item copies the text and opens the platform, then asks whether it was posted.
 */
export function NotificationsPanel() {
  const n = useNotifications().data
  if (!n || needsAction(n) === 0)
    return <p className="text-sm text-muted">Nothing needs you right now.</p>
  return (
    <div className="flex flex-col gap-6">
      {(n.due.length > 0 || n.checkin_reminder) && (
        <section aria-labelledby="notifications-title">
          <h2 id="notifications-title" className="text-sm font-semibold">
            Due now
          </h2>
          <ul className="mt-2 flex flex-col gap-2">
            {n.checkin_reminder && (
              <li className="rounded-panel border border-line p-3 text-sm">
                <p>You haven't written today's check-in.</p>
                <Link to="/" className="mt-1 inline-block text-thread underline underline-offset-4">
                  Write today's check-in
                </Link>
              </li>
            )}
            {n.due.map((d) => (
              <PostItem key={d.id} draft={d} kind="due" />
            ))}
          </ul>
        </section>
      )}
      {n.missed.length > 0 && (
        <section aria-labelledby="missed-title">
          <h2 id="missed-title" className="text-sm font-semibold text-danger">
            Missed
          </h2>
          <ul className="mt-2 flex flex-col gap-2">
            {n.missed.map((d) => (
              <PostItem key={d.id} draft={d} kind="missed" />
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function PostItem({ draft, kind }: { draft: DraftRow; kind: 'due' | 'missed' }) {
  const zone = useMe().data?.timezone
  const hand = useHandOff(draft)
  const schedule = useScheduleDraft()
  const [open, setOpen] = useState(false)
  const name = LABEL[draft.platform]
  const when = draft.scheduled_for ? formatShort(draft.scheduled_for, zone) : ''
  const firstLine = draft.text.split('\n').find((l) => l.trim()) ?? ''

  return (
    <li
      className={`rounded-panel border p-3 text-sm ${kind === 'missed' ? 'border-danger' : 'border-line'}`}
    >
      <p className="flex items-center gap-2">
        <PlatformMark platform={draft.platform} />
        <span className="font-semibold">
          {kind === 'due' ? `${name} post due now` : `${name} · ${when} passed`}
        </span>
      </p>
      <p className="mt-1 truncate text-muted">{firstLine}</p>
      {kind === 'missed' && (
        <p className="mt-1 text-danger">
          {draft.bot_error
            ? `The bot couldn't post it: ${draft.bot_error}`
            : 'Post now or reschedule.'}
        </p>
      )}
      {!hand.asked && hand.failed && (
        <p role="alert" className="mt-1 text-danger">
          {hand.failed}
        </p>
      )}
      {hand.asked ? (
        <HandOffPrompt hand={hand} className="mt-2" />
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void hand.post()}
            className="min-h-9 rounded-full bg-primary px-3 font-semibold text-on-primary"
          >
            {hand.label}
          </button>
          {kind === 'missed' && (
            <Popover open={open} onOpenChange={setOpen}>
              <PopoverTrigger className="min-h-9 rounded-full border border-edge px-3 hover:bg-sunken">
                Change time
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80">
                <WhenPicker
                  id={draft.id}
                  zone={zone}
                  busy={schedule.isPending}
                  submit="Save time"
                  onPick={(day, at) =>
                    schedule.mutate(
                      { draftId: draft.id, day, at },
                      { onSuccess: () => setOpen(false) },
                    )
                  }
                  onCancel={() => setOpen(false)}
                />
                {schedule.error && (
                  <p role="alert" className="mt-2 text-sm text-danger">
                    {schedule.error.message}
                  </p>
                )}
              </PopoverContent>
            </Popover>
          )}
          {draft.thread_id && (
            <Link
              to={`/chat/${draft.thread_id}`}
              className="inline-flex min-h-9 items-center px-1 text-thread underline underline-offset-4"
            >
              Open
            </Link>
          )}
        </div>
      )}
    </li>
  )
}
