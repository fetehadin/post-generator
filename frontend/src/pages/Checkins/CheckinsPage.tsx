import { useId, useState } from 'react'
import { useCheckins, useDeleteCheckin, usePatchCheckin } from '../../api/checkins'
import type { Checkin } from '../../api/types'
import { ConfirmDialog } from '../../components/ConfirmDialog'

const dayFormat = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC', // a check-in's day is a plain date, not a moment in time
})

/**
 * Past check-ins (FR-6: view, edit, delete). Each chat opens with its own check-in and can edit
 * it there; this page also reaches check-ins saved before chats existed, which have no chat.
 */
export function CheckinsPage() {
  const checkins = useCheckins()
  return (
    <div className="mx-auto max-w-column px-4 py-12 md:px-6 md:py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Past check-ins</h1>
      <p className="mt-1 text-sm text-muted">
        What you told Voxlace each day. Drafts made from a check-in stay if you change or delete it.
      </p>
      {checkins.isError && (
        <p role="alert" className="mt-6 text-danger">
          {checkins.error.message}
        </p>
      )}
      {checkins.data &&
        (checkins.data.items.length ? (
          <ul className="mt-6 flex flex-col">
            {checkins.data.items.map((c) => (
              <CheckinRow key={`${c.id}-${c.updated_at}`} checkin={c} />
            ))}
          </ul>
        ) : (
          <p className="mt-6 text-muted">No check-ins yet. Start a chat to write one.</p>
        ))}
    </div>
  )
}

function CheckinRow({ checkin }: { checkin: Checkin }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(checkin.text)
  const patch = usePatchCheckin()
  const remove = useDeleteCheckin()
  const boxId = useId()
  const day = dayFormat.format(new Date(`${checkin.day}T00:00:00Z`))
  return (
    <li className="border-b border-line py-3">
      <p className="text-xs text-muted">{day}</p>
      {editing ? (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (text.trim())
              patch.mutate({ id: checkin.id, text }, { onSuccess: () => setEditing(false) })
          }}
        >
          <label htmlFor={boxId} className="mt-2 block text-sm font-semibold">
            Check-in text
          </label>
          <textarea
            id={boxId}
            maxLength={4000}
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="mt-1 block min-h-20 w-full rounded-control border border-edge bg-surface p-2 font-serif [field-sizing:content]"
          />
          <div className="mt-2 flex gap-2">
            <button
              type="submit"
              disabled={patch.isPending || !text.trim()}
              className="min-h-9 rounded-control bg-primary px-3 text-sm font-semibold text-on-primary"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="min-h-9 rounded-control border border-edge px-3 text-sm hover:bg-sunken"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="flex items-start gap-2">
          <p className="flex-1 font-serif whitespace-pre-wrap">{checkin.text}</p>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="min-h-9 rounded-control px-2 text-sm text-muted hover:bg-sunken hover:text-ink"
          >
            Edit
          </button>
          <ConfirmDialog
            trigger="Delete"
            triggerClassName="min-h-9 rounded-control px-2 text-sm text-muted hover:bg-sunken hover:text-danger"
            title="Delete this check-in?"
            description="Drafts made from it stay. This can't be undone."
            confirm="Delete check-in"
            busy={remove.isPending}
            error={remove.error?.message}
            onConfirm={() => remove.mutate(checkin.id)}
          />
        </div>
      )}
      {patch.error && (
        <p role="alert" className="mt-1 text-sm text-danger">
          {patch.error.message}
        </p>
      )}
    </li>
  )
}
