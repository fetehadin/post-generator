import { type AIKey, type AIProviderInfo, useAIKeys, useRemoveAIKey } from '../../api/aiKeys'
import { GetKeyLink, KeyPaste } from '../../components/KeyPaste'
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/popover'

const button =
  'inline-flex min-h-12 items-center rounded-full border border-edge px-4 text-sm hover:bg-sunken'
const day = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' })

/**
 * Profile → AI keys (FR-48): your saved keys, then one paste field that tells which service the
 * key is from and checks it at once, then a short list of free services and the paid ones. Your key is tried first; if it fails, the free models write the draft and say so.
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
    <div className="mt-3 flex flex-col gap-5">
      {keys.data.keys.length > 0 && (
        <div className="flex flex-col gap-3">
          {keys.data.keys.map((k) => (
            <SavedKey key={k.provider} saved={k} provider={byId.get(k.provider)} />
          ))}
        </div>
      )}

      <section id="add-key" aria-label="Add an API key" className="flex flex-col gap-2">
        <KeyPaste providers={providers} />
        <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted">
          Stored encrypted. Only used to write your drafts. Remove it anytime.
          <WhatIsAKey />
        </p>
      </section>

      <section aria-labelledby="no-key" className="flex flex-col gap-2 text-sm">
        <h3 id="no-key" className="font-semibold">
          No key yet? Get one free
        </h3>
        <ul className="flex flex-col gap-1">
          {free.map((p) => (
            <li key={p.id}>
              <GetKeyLink
                provider={p}
                className="inline-flex min-h-11 items-center font-semibold text-thread underline"
              />
              {p.note && <p className="text-muted">{p.note}</p>}
            </li>
          ))}
        </ul>
        {paid.length > 0 && (
          <p className="text-muted">
            Paid:{' '}
            {paid.map((p, i) => (
              <span key={p.id}>
                {i > 0 && ' · '}
                <a
                  href={p.key_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-thread underline"
                >
                  {p.name} ↗
                </a>
              </span>
            ))}
          </p>
        )}
      </section>
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
        An API key is a long code that lets Voxlace ask an AI service to write on your account.
        Gemini and Groq give one for free, within their free limits. A ChatGPT Plus, Claude Pro or
        Gemini subscription is not a key.
      </PopoverContent>
    </Popover>
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
