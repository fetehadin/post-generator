import { useId, useState } from 'react'
import {
  type AIKey,
  type AIKeys as AIKeysData,
  type AIProvider,
  useAIKeys,
  useRemoveAIKey,
  useSaveAIKey,
} from '../../api/aiKeys'

const button = 'inline-flex min-h-10 items-center rounded-full border border-edge px-4 text-sm'
const field =
  'mt-1 block min-h-10 w-full rounded-control border border-edge bg-surface px-3 text-sm'
const day = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' })
type Provider = AIKeysData['providers'][number]

/**
 * Profile → AI keys (FR-48): optionally bring your own API key from one of six providers.
 * Your key is tried first, with the model you pick; if it fails, the free models write the
 * draft and say so. Keys are checked with one tiny call, stored encrypted and never shown
 * again: only a masked "sk-…a9F2".
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

  const byId = new Map(keys.data.providers.map((p) => [p.id, p]))
  return (
    <div className="mt-4 flex flex-col gap-6">
      <p className="rounded-panel border border-line p-4 text-sm">
        <b>Optional.</b> A ChatGPT Plus, Claude Pro or Gemini subscription is <b>not</b> an API key.
        Get a key from the provider's developer console (links below). Without one, Voxlace's free
        models write your drafts, as they do now.
      </p>

      {keys.data.keys.length > 0 && (
        <section aria-labelledby="your-keys" className="flex flex-col gap-3">
          <h3 id="your-keys" className="font-semibold">
            Your keys
          </h3>
          <p className="text-sm text-muted">
            Tried first, newest first. Drafts on your key don't count towards the daily limit.
          </p>
          {keys.data.keys.map((k) => (
            <SavedKey key={k.provider} saved={k} provider={byId.get(k.provider)} />
          ))}
        </section>
      )}

      <AddKey providers={keys.data.providers} saved={keys.data.keys} />

      <p className="text-sm text-muted">
        Your key is stored encrypted and only you can use it. Remove it any time: it's deleted for
        good. Deleting your account removes it too.
      </p>
    </div>
  )
}

function SavedKey({ saved, provider }: { saved: AIKey; provider: Provider | undefined }) {
  const remove = useRemoveAIKey()
  const name = provider?.name ?? saved.provider
  return (
    <div className="rounded-panel border border-line p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="font-semibold">{name}</h4>
        {saved.status === 'rejected' ? (
          <span className="text-sm font-semibold text-danger">Not working</span>
        ) : (
          <span className="text-sm text-muted">In use</span>
        )}
      </div>
      <p className="mt-1 text-sm">
        <span className="font-mono">{saved.masked}</span>
        <span className="text-muted">
          {' '}
          · {saved.model ?? `${provider?.default_model ?? 'default'} (default)`} · added{' '}
          {day.format(new Date(saved.added_at))}
          {saved.last_used_at
            ? ` · last used ${day.format(new Date(saved.last_used_at))}`
            : ' · not used yet'}
        </span>
      </p>
      {saved.status === 'rejected' && (
        <p role="alert" className="mt-2 text-sm text-danger">
          The provider refused this key{saved.last_error ? ` (${saved.last_error})` : ''}. Drafts
          use the free models until you add it again.
        </p>
      )}
      <button
        type="button"
        onClick={() => remove.mutate(saved.provider)}
        disabled={remove.isPending}
        className={`${button} mt-3`}
      >
        {remove.isPending ? 'Removing…' : `Remove ${name} key`}
      </button>
      {remove.isError && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {remove.error.message}
        </p>
      )}
    </div>
  )
}

function AddKey({ providers, saved }: { providers: Provider[]; saved: AIKey[] }) {
  const ids = { provider: useId(), key: useId(), model: useId() }
  const [providerId, setProviderId] = useState<AIProvider>(providers[0]?.id ?? 'groq')
  const [key, setKey] = useState('')
  const [model, setModel] = useState('')
  const [done, setDone] = useState('')
  const save = useSaveAIKey()
  const provider = providers.find((p) => p.id === providerId)
  const replacing = saved.some((k) => k.provider === providerId)

  return (
    <form
      aria-labelledby="add-key"
      className="flex flex-col gap-3 rounded-panel border border-line p-4"
      onSubmit={(e) => {
        e.preventDefault()
        setDone('')
        save.mutate(
          { provider: providerId, key: key.trim(), model: model.trim() },
          {
            onSuccess: (k) => {
              setKey('')
              setModel('')
              setDone(`Saved. Your ${provider?.name ?? ''} key ${k.masked} works.`)
            },
          },
        )
      }}
    >
      <h3 id="add-key" className="font-semibold">
        {replacing ? 'Add or replace a key' : 'Add a key'}
      </h3>
      <label htmlFor={ids.provider} className="text-sm">
        Provider
        <select
          id={ids.provider}
          value={providerId}
          onChange={(e) => {
            setProviderId(e.target.value as AIProvider)
            setModel('')
          }}
          className={field}
        >
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <label htmlFor={ids.key} className="text-sm">
        API key
        <input
          id={ids.key}
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          placeholder="Paste the key"
          className={`${field} font-mono`}
        />
      </label>
      <label htmlFor={ids.model} className="text-sm">
        Model <span className="text-muted">(optional)</span>
        <input
          id={ids.model}
          value={model}
          onChange={(e) => setModel(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          placeholder={provider?.default_model}
          className={`${field} font-mono`}
        />
      </label>
      {provider && (
        <p className="text-sm text-muted">
          Empty uses {provider.default_model}. Get a key at{' '}
          <a
            href={provider.key_url}
            target="_blank"
            rel="noreferrer"
            className="text-thread underline"
          >
            {provider.name}'s developer console
          </a>
          .
        </p>
      )}
      <button
        type="submit"
        disabled={!key.trim() || save.isPending}
        className="inline-flex min-h-10 items-center self-start rounded-full bg-primary px-4 text-sm font-semibold text-on-primary disabled:cursor-not-allowed disabled:bg-sunken disabled:text-muted"
      >
        {save.isPending ? 'Checking the key…' : 'Check and save'}
      </button>
      {save.isError && (
        <p role="alert" className="text-sm text-danger">
          {save.error.message}
        </p>
      )}
      {done && (
        <p role="status" className="text-sm">
          {done}
        </p>
      )}
    </form>
  )
}
