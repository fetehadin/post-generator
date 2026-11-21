import { useState } from 'react'
import { type AIKey, activeKey, useAIKeys } from '../api/aiKeys'
import { isFirstSession, snooze, snoozed } from '../lib/storage'
import { GetKeyLink, KeyPaste } from './KeyPaste'

const SNOOZE = 'key-nudge'
const choice =
  'inline-flex min-h-12 flex-1 items-center justify-center rounded-full border border-edge px-4 text-sm font-semibold hover:bg-sunken'

const TEXT = {
  limit: "You've used today's free drafts. Add a free key to keep going, or come back tomorrow.",
  busy: "The free AI is busy right now. Add a free key so your drafts don't wait, or try again in a minute.",
}

/**
 * FR-48 + FR-30: the one place that offers a free key, shown when a draft couldn't be written
 * (the daily limit, or the shared AI busy). Never blocks: "Maybe later" hides it for 7 days.
 * Hidden in the user's first session and once they have a working key.
 */
export function AddKeyNudge({
  reason,
  onSaved,
}: {
  reason: keyof typeof TEXT
  onSaved?: (key: AIKey) => void
}) {
  const keys = useAIKeys()
  const [open, setOpen] = useState(false)
  const [hidden, setHidden] = useState(() => isFirstSession() || snoozed(SNOOZE))
  // Stays shown after a save, so the success line in KeyPaste can be read.
  const [saved, setSaved] = useState(false)

  if (hidden || !keys.data?.enabled) return null
  if (activeKey(keys.data) && !saved) return null
  const free = keys.data.providers.filter((p) => p.free)

  return (
    <section
      aria-label="Add a free key"
      className="mb-3 flex flex-col gap-3 rounded-panel border border-line bg-surface p-4"
    >
      <p className="text-sm">{TEXT[reason]}</p>
      {!open ? (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setOpen(true)} className={choice}>
            Add a free key
          </button>
          <button
            type="button"
            onClick={() => {
              snooze(SNOOZE)
              setHidden(true)
            }}
            className={choice}
          >
            Maybe later
          </button>
        </div>
      ) : (
        <>
          {!saved && (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-muted">
                Takes about a minute. Get one, copy it, come back here.
              </p>
              <div className="flex flex-wrap gap-2">
                {free.map((p) => (
                  <GetKeyLink key={p.id} provider={p} />
                ))}
              </div>
            </div>
          )}
          <KeyPaste
            providers={keys.data.providers}
            onSaved={(k) => {
              setSaved(true)
              onSaved?.(k)
            }}
          />
          {!saved && (
            <button
              type="button"
              onClick={() => {
                snooze(SNOOZE)
                setHidden(true)
              }}
              className="self-start text-sm text-muted underline"
            >
              Maybe later
            </button>
          )}
        </>
      )}
    </section>
  )
}
