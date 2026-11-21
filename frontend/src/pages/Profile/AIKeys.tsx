import { type AIKey, type AIProviderInfo, useAIKeys, useRemoveAIKey } from '../../api/aiKeys'
import { GetKeyLink, KeyPaste } from '../../components/KeyPaste'
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/popover'

const button =
  'inline-flex min-h-12 items-center rounded-full border border-edge px-4 text-sm hover:bg-sunken'
const day = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' })

/**
 * Profile → AI keys (FR-48): "Get a free key". One paste field that tells which service the
 * key is from and checks it at once; cards for the three free services, the paid ones folded
 * away. Your key is tried first; if it fails, the free models write the draft and say so.
 * Keys are stored encrypted and never shown again: only a masked "sk-…a9F2".
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

  const { providers } = keys.data
  const byId = new Map(providers.map((p) => [p.id, p]))
  const free = providers.filter((p) => p.free)
  const paid = providers.filter((p) => !p.free)

  return (
    <div className="mt-4 flex flex-col gap-6">
      {keys.data.keys.length > 0 && (
        <section aria-labelledby="your-keys" className="flex flex-col gap-3">
          <h3 id="your-keys" className="font-semibold">
            Your keys
          </h3>
          <p className="text-sm text-muted">
            Tried first, newest first. Drafts on your key have no daily limit.
          </p>
          {keys.data.keys.map((k) => (
            <SavedKey key={k.provider} saved={k} provider={byId.get(k.provider)} />
          ))}
        </section>
      )}

      <section
        id="add-key"
        aria-labelledby="add-key-title"
        className="flex flex-col gap-3 rounded-panel border border-line p-4"
      >
        <h3 id="add-key-title" className="font-semibold">
          {keys.data.keys.length ? 'Add or replace a free key' : 'Add a free key'}
        </h3>
        <KeyPaste providers={providers} />
        <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted">
          Stored encrypted. Only used to write your drafts. Remove it anytime.
          <WhatIsAKey />
        </p>
      </section>

      <section aria-labelledby="no-key" className="flex flex-col gap-3">
        <h3 id="no-key" className="font-semibold">
          Don't have a key yet?
        </h3>
        <p className="text-sm text-muted">These are free. Each takes about a minute.</p>
        <div className="grid gap-3 md:grid-cols-3">
          {free.map((p) => (
            <ProviderCard key={p.id} provider={p} />
          ))}
        </div>
      </section>

      {paid.length > 0 && (
        <details className="rounded-panel border border-line p-4">
          <summary className="cursor-pointer font-semibold">Other providers</summary>
          <ul className="mt-3 flex flex-col gap-3">
            {paid.map((p) => (
              <li key={p.id} className="text-sm">
                <a
                  href={p.key_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-thread underline"
                >
                  {p.name} ↗
                </a>
                {p.note && <span className="block text-muted">{p.note}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

function WhatIsAKey() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="min-h-10 text-thread underline">
          What is an API key?
        </button>
      </PopoverTrigger>
      <PopoverContent className="max-w-xs text-sm">
        A key is a long code that lets Voxlace ask an AI service to write on your account, within
        that service's free limits. A ChatGPT Plus, Claude Pro or Gemini subscription is not a key.
      </PopoverContent>
    </Popover>
  )
}

function ProviderCard({ provider }: { provider: AIProviderInfo }) {
  return (
    <article className="flex flex-col gap-2 rounded-panel border border-line p-4">
      <h4 className="font-semibold">{provider.name}</h4>
      <ol className="list-decimal pl-5 text-sm">
        {provider.steps.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
      {provider.note && <p className="text-sm text-muted">{provider.note}</p>}
      <GetKeyLink
        provider={provider}
        className={`${button} mt-auto justify-center font-semibold`}
      />
    </article>
  )
}

function SavedKey({ saved, provider }: { saved: AIKey; provider: AIProviderInfo | undefined }) {
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
        // Never the provider's raw reply: just what happened and what to do.
        <p role="alert" className="mt-2 text-sm text-danger">
          {name} stopped accepting this key. Drafts use the free models until you paste a new one
          above.
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {saved.status === 'rejected' && (
          <a href="#add-key" className={button}>
            Replace the key
          </a>
        )}
        <button
          type="button"
          onClick={() => remove.mutate(saved.provider)}
          disabled={remove.isPending}
          className={button}
        >
          {remove.isPending ? 'Removing…' : `Remove ${name} key`}
        </button>
      </div>
      {remove.isError && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {remove.error.message}
        </p>
      )}
    </div>
  )
}
