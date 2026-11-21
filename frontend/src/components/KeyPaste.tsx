import { type ReactNode, useEffect, useId, useRef, useState } from 'react'
import { type AIKey, type AIProviderInfo, detectProvider, useSaveAIKey } from '../api/aiKeys'
import { ApiError } from '../api/client'
import { Icon } from './Icon'

const TRIP = 'voxlace.keyTrip' // which "Get free key" page the user went to, this tab only
const REFUSALS = new Set(['invalid_key', 'quota_exceeded', 'region_or_age_blocked'])
const button =
  'inline-flex min-h-12 items-center justify-center rounded-control border border-edge px-4 text-sm font-semibold'

/** "Get free key ↗": opens the provider's key page in a new tab and remembers the trip, so
 * the paste field is ready (and offers the copied key) when the user comes back. */
export function GetKeyLink({
  provider,
  className = button,
  children,
}: {
  provider: AIProviderInfo
  className?: string
  children?: ReactNode
}) {
  return (
    <a
      href={provider.key_url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => {
        try {
          sessionStorage.setItem(TRIP, provider.id)
        } catch {
          // storage off: the field just won't be focused on return
        }
      }}
      className={className}
    >
      {children ?? `Get free ${shortName(provider)} key ↗`}
    </a>
  )
}

const shortName = (p: AIProviderInfo) => p.name.replace(/^Google /, '').replace(/ \(.*\)$/, '')

function takeTrip(): string | null {
  try {
    const id = sessionStorage.getItem(TRIP)
    sessionStorage.removeItem(TRIP)
    return id
  } catch {
    return null
  }
}

async function readClipboard(): Promise<string | null> {
  try {
    return (await navigator.clipboard?.readText()) ?? null
  } catch {
    return null // permission refused or not supported: the user pastes by hand
  }
}

type Status =
  | { kind: 'idle' }
  | { kind: 'checking'; name: string }
  | { kind: 'ok'; name: string }
  | { kind: 'error'; message: string; other?: AIProviderInfo }

/**
 * FR-48: one field for a free key. The provider is detected from how the key starts, a
 * pasted key is checked at once (no Save click), and the outcome is announced in a status
 * line that always keeps its space, so nothing jumps while checking.
 */
export function KeyPaste({
  providers,
  onSaved,
}: {
  providers: AIProviderInfo[]
  onSaved?: (key: AIKey) => void
}) {
  const ids = { key: useId(), provider: useId(), model: useId(), help: useId() }
  const input = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState('')
  const [chosen, setChosen] = useState<string>('')
  const [model, setModel] = useState('')
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [offer, setOffer] = useState<AIProviderInfo | null>(null)
  const save = useSaveAIKey()

  const detected = detectProvider(value, providers)
  const provider = detected ?? providers.find((p) => p.id === chosen)
  const unknownShape = value.trim().length >= 20 && !detected

  // Back from the provider's key page: focus the field and offer the copied key.
  useEffect(() => {
    async function back() {
      if (document.visibilityState !== 'visible') return
      const id = takeTrip()
      const p = providers.find((x) => x.id === id)
      if (!p) return
      input.current?.focus()
      input.current?.scrollIntoView({ block: 'center' })
      // Only peek at the clipboard when the browser already allows it; otherwise the offer
      // is a button, and reading the clipboard happens on that tap.
      try {
        const perm = await navigator.permissions?.query({
          name: 'clipboard-read' as PermissionName,
        })
        if (perm?.state === 'granted') {
          const text = await readClipboard()
          if (text && detectProvider(text, providers)?.id !== p.id) return
        }
      } catch {
        // no Permissions API for the clipboard (Firefox, Safari): just offer
      }
      setOffer(p)
    }
    document.addEventListener('visibilitychange', back)
    window.addEventListener('focus', back)
    return () => {
      document.removeEventListener('visibilitychange', back)
      window.removeEventListener('focus', back)
    }
  }, [providers])

  function check(key: string, p: AIProviderInfo | undefined) {
    const k = key.trim()
    if (!k || !p || save.isPending) return
    setOffer(null)
    setStatus({ kind: 'checking', name: shortName(p) })
    save.mutate(
      { provider: p.id, key: k, model: model.trim() },
      {
        onSuccess: (saved) => {
          setValue('')
          setModel('')
          setStatus({ kind: 'ok', name: shortName(p) })
          onSaved?.(saved)
        },
        onError: (e) => {
          const code = e instanceof ApiError ? e.code : ''
          setStatus({
            kind: 'error',
            message: e.message,
            other: REFUSALS.has(code) ? providers.find((x) => x.free && x.id !== p.id) : undefined,
          })
        },
      },
    )
  }

  async function pasteFromClipboard(expect?: AIProviderInfo) {
    const text = await readClipboard()
    if (!text) {
      input.current?.focus()
      setStatus({ kind: 'error', message: 'Press and hold in the field (or Ctrl+V) to paste.' })
      return
    }
    const p = detectProvider(text, providers)
    if (expect && p?.id !== expect.id) {
      setStatus({
        kind: 'error',
        message: `That isn't a ${shortName(expect)} key. Copy the key again, then tap here.`,
      })
      return
    }
    setValue(text.trim())
    if (p) check(text, p)
  }

  return (
    <div className="flex flex-col gap-2">
      {offer && (
        <button
          type="button"
          onClick={() => void pasteFromClipboard(offer)}
          className={`${button} bg-primary text-on-primary`}
        >
          Use the {shortName(offer)} key you just copied?
        </button>
      )}
      <label htmlFor={ids.key} className="text-sm font-semibold">
        Paste your free key
      </label>
      <div className="flex gap-2">
        <input
          ref={input}
          id={ids.key}
          type="password"
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            if (status.kind !== 'checking') setStatus({ kind: 'idle' })
          }}
          onPaste={(e) => {
            const text = e.clipboardData.getData('text')
            const p = detectProvider(text, providers)
            if (p) {
              e.preventDefault()
              setValue(text.trim())
              check(text, p)
            }
          }}
          autoComplete="off"
          spellCheck={false}
          aria-describedby={ids.help}
          placeholder="AIza…  or  gsk_…"
          className="block min-h-12 w-full min-w-0 rounded-control border border-edge bg-surface px-3 font-mono text-sm"
        />
        <button
          type="button"
          onClick={() => void pasteFromClipboard()}
          disabled={save.isPending}
          className={button}
        >
          Paste
        </button>
      </div>
      <p id={ids.help} className="text-sm text-muted">
        {detected ? `${detected.name} key detected.` : 'We tell which service it is from.'}
      </p>

      {unknownShape && (
        <label htmlFor={ids.provider} className="text-sm">
          Which service is this key from?
          <select
            id={ids.provider}
            value={chosen}
            onChange={(e) => setChosen(e.target.value)}
            className="mt-1 block min-h-12 w-full rounded-control border border-edge bg-surface px-3 text-sm"
          >
            <option value="">Pick one</option>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <details className="text-sm">
        <summary className="cursor-pointer text-muted">Advanced: choose a model</summary>
        <label htmlFor={ids.model} className="mt-2 block">
          Model <span className="text-muted">(optional)</span>
          <input
            id={ids.model}
            value={model}
            onChange={(e) => setModel(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            placeholder={provider?.default_model ?? 'the service’s default'}
            className="mt-1 block min-h-12 w-full rounded-control border border-edge bg-surface px-3 font-mono text-sm"
          />
        </label>
      </details>

      {value.trim() && status.kind !== 'checking' && status.kind !== 'ok' && (
        <button
          type="button"
          onClick={() => check(value, provider)}
          disabled={!provider}
          className={`${button} self-start bg-primary text-on-primary disabled:cursor-not-allowed disabled:bg-sunken disabled:text-muted`}
        >
          Check the key
        </button>
      )}

      {/* Always rendered, with room for two lines, so the layout doesn't shift. */}
      <div aria-live="polite" role="status" className="min-h-12 text-sm">
        {status.kind === 'checking' && <p>Checking your {status.name} key…</p>}
        {status.kind === 'ok' && (
          <p className="flex items-center gap-1 font-semibold">
            <Icon name="check" className="size-4 shrink-0" />
            {status.name} key works. Your own key is active: no daily limit.
          </p>
        )}
        {status.kind === 'error' && (
          <p className="text-danger">
            {status.message}
            {status.other && (
              <>
                {' '}
                <GetKeyLink provider={status.other} className="text-thread underline" />
              </>
            )}
          </p>
        )}
      </div>
    </div>
  )
}
