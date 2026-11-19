import { useId, useState } from 'react'
import {
  type AIKey,
  type AIKeys as AIKeysData,
  type AIProvider,
  useAIKeys,
  useRemoveAIKey,
  useSaveAIKey,
} from '../../api/aiKeys'

const button = 'inline-flex min-h-10 items-center rounded-control border border-edge px-4 text-sm'
const day = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' })

/**
 * Profile → AI keys (FR-48): bring your own Gemini or Groq key. Drafts try your key first and
 * fall back to Voxlace's; drafts on your key don't count towards the daily limit. The key is
 * checked with the provider, stored encrypted and never shown again, only its last four.
 */
export function AIKeys() {
  const keys = useAIKeys()

  if (keys.isPending) return <p className="mt-4 text-sm text-muted">Loading…</p>
  if (keys.isError)
    return (
      <p role="alert" className="mt-4 text-sm text-danger">
        {keys.error.message}
      </p>
    )
  if (!keys.data.enabled)
    return (
      <p className="mt-4 text-sm text-muted">
        Adding your own AI key isn't switched on for this app yet.
      </p>
    )

  return (
    <div className="mt-4 flex flex-col gap-4">
      {keys.data.providers.map((p) => (
        <ProviderKey
          key={p.id}
          provider={p}
          saved={keys.data.keys.find((k) => k.provider === p.id)}
        />
      ))}
      <p className="text-sm text-muted">
        Your key is checked with the provider, stored encrypted and never shown again. Only you can
        use it. Remove it any time; deleting your account removes it too.
      </p>
    </div>
  )
}

function ProviderKey({
  provider,
  saved,
}: {
  provider: AIKeysData['providers'][number]
  saved: AIKey | undefined
}) {
  const [editing, setEditing] = useState(false)
  const showForm = editing || !saved

  return (
    <section
      aria-labelledby={`key-${provider.id}`}
      className="rounded-panel border border-line p-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id={`key-${provider.id}`} className="font-semibold">
          {provider.name}
        </h3>
        {saved && <Status saved={saved} />}
      </div>
      <p className="mt-1 text-sm text-muted">{provider.used_for}.</p>

      {saved && !editing && (
        <SavedKey saved={saved} provider={provider.id} onReplace={() => setEditing(true)} />
      )}
      {showForm && (
        <KeyForm
          provider={provider.id}
          name={provider.name}
          keyUrl={provider.key_url}
          onDone={() => setEditing(false)}
          onCancel={saved ? () => setEditing(false) : undefined}
        />
      )}
    </section>
  )
}

function Status({ saved }: { saved: AIKey }) {
  if (saved.status === 'rejected')
    return <span className="text-sm font-semibold text-danger">Not working</span>
  return <span className="text-sm text-muted">In use</span>
}

function SavedKey({
  saved,
  provider,
  onReplace,
}: {
  saved: AIKey
  provider: AIProvider
  onReplace: () => void
}) {
  const remove = useRemoveAIKey()
  return (
    <div className="mt-3 flex flex-col gap-2">
      <p className="text-sm">
        Key ending in <b className="font-mono">{saved.last4}</b>
        <span className="text-muted">
          {' '}
          · added {day.format(new Date(saved.added_at))}
          {saved.last_used_at
            ? ` · last used ${day.format(new Date(saved.last_used_at))}`
            : ' · not used yet'}
        </span>
      </p>
      {saved.status === 'rejected' && (
        <p role="alert" className="text-sm text-danger">
          The provider refused this key{saved.last_error ? ` (${saved.last_error})` : ''}. Drafts
          use Voxlace's key until you replace it.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onReplace} className={button}>
          Replace key
        </button>
        <button
          type="button"
          onClick={() => remove.mutate(provider)}
          disabled={remove.isPending}
          className={button}
        >
          {remove.isPending ? 'Removing…' : 'Remove'}
        </button>
      </div>
      {remove.isError && (
        <p role="alert" className="text-sm text-danger">
          {remove.error.message}
        </p>
      )}
    </div>
  )
}

function KeyForm({
  provider,
  name,
  keyUrl,
  onDone,
  onCancel,
}: {
  provider: AIProvider
  name: string
  keyUrl: string
  onDone: () => void
  onCancel?: () => void
}) {
  const id = useId()
  const [value, setValue] = useState('')
  const save = useSaveAIKey()

  return (
    <form
      className="mt-3 flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        save.mutate(
          { provider, key: value.trim() },
          {
            onSuccess: () => {
              setValue('')
              onDone()
            },
          },
        )
      }}
    >
      <label htmlFor={id} className="text-sm">
        Your {name} API key
      </label>
      <div className="flex flex-wrap gap-2">
        <input
          id={id}
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          placeholder="Paste the key"
          className="min-h-10 min-w-0 flex-1 rounded-control border border-edge bg-surface px-3 font-mono text-sm"
        />
        <button
          type="submit"
          disabled={!value.trim() || save.isPending}
          className="inline-flex min-h-10 items-center rounded-control bg-primary px-4 text-sm font-semibold text-on-primary disabled:cursor-not-allowed disabled:bg-sunken disabled:text-muted"
        >
          {save.isPending ? 'Checking…' : 'Save key'}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="min-h-10 px-3 text-sm text-muted">
            Cancel
          </button>
        )}
      </div>
      <p className="text-sm text-muted">
        No key yet?{' '}
        <a href={keyUrl} target="_blank" rel="noreferrer" className="text-thread underline">
          Make one at {name}
        </a>
        . Free keys work too.
      </p>
      {save.isError && (
        <p role="alert" className="text-sm text-danger">
          {save.error.message}
        </p>
      )}
    </form>
  )
}
