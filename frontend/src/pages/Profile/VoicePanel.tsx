import { useState } from 'react'
import {
  type PlatformInfo,
  usePlatform,
  useSaveVoiceCard,
  useSetPremium,
  useWriteVoiceCard,
} from '../../api/platforms'
import type { Platform } from '../../api/types'

const pct = (x: number) => `${Math.round(x * 100)}%`
const LIMIT = new Intl.NumberFormat()

/** Profile → one platform's voice: stats, the voice card and settings (FR-5, FR-22, FR-26). */
export function VoicePanel({ platform, label }: { platform: Platform; label: string }) {
  const info = usePlatform(platform)
  if (info.isPending) return <p className="mt-4 text-sm text-muted">Loading…</p>
  if (info.isError)
    return (
      <p role="alert" className="mt-4 text-danger">
        {info.error.message}
      </p>
    )
  // Keyed by the saved time so the card text restarts from the server after each save.
  return (
    <VoiceBody key={info.data.voice_card_updated_at ?? 'none'} info={info.data} label={label} />
  )
}

function VoiceBody({ info, label }: { info: PlatformInfo; label: string }) {
  const [card, setCard] = useState(info.voice_card)
  const save = useSaveVoiceCard(info.platform)
  const write = useWriteVoiceCard(info.platform)
  const s = info.stats
  const busy = save.isPending || write.isPending
  const error = save.error ?? write.error

  return (
    <div className="mt-4 rounded-panel border border-line bg-paper p-4">
      <h3 className="font-semibold">Your {label} voice</h3>

      {s.thin && (
        <p role="status" className="mt-2 rounded-control bg-sunken px-3 py-2 text-sm">
          {s.post_count === 0
            ? `No ${label} posts yet. Import some so drafts sound like you.`
            : `Only ${s.post_count} ${label} posts. With fewer than 20, drafts may not sound quite like you.`}
        </p>
      )}

      {s.post_count > 0 && (
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
          <Stat term="Posts" value={String(s.post_count)} />
          <Stat term="Typical length" value={`${s.median_length} chars`} />
          <Stat term="Typical lines" value={String(s.median_lines)} />
          <Stat term="With emoji" value={pct(s.emoji_share)} />
          <Stat term="With hashtags" value={pct(s.hashtag_share)} />
          <Stat term="With Amharic" value={pct(s.ethiopic_share)} />
        </dl>
      )}

      <label htmlFor={`voice-${info.platform}`} className="mt-4 block text-sm font-semibold">
        Voice card
      </label>
      <p className="text-sm text-muted">
        How you write here, in a few lines. Lines you edit stay when Voxlace rewrites it.
      </p>
      <textarea
        id={`voice-${info.platform}`}
        value={card}
        onChange={(e) => setCard(e.target.value)}
        placeholder={
          s.post_count ? 'Let Voxlace write it from your posts, or write it yourself.' : ''
        }
        className="mt-2 block min-h-28 w-full resize-y rounded-control border border-edge bg-surface p-3 text-sm leading-relaxed [field-sizing:content]"
      />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => save.mutate(card)}
          disabled={busy || card === info.voice_card}
          className="inline-flex min-h-10 items-center rounded-control bg-thread px-4 text-sm font-semibold text-on-thread disabled:cursor-not-allowed disabled:bg-sunken disabled:text-muted"
        >
          {save.isPending ? 'Saving…' : 'Save voice card'}
        </button>
        <button
          type="button"
          onClick={() => write.mutate()}
          disabled={busy || s.post_count === 0 || card !== info.voice_card}
          title={card !== info.voice_card ? 'Save your edits first' : undefined}
          className="inline-flex min-h-10 items-center rounded-control border border-edge px-4 text-sm disabled:text-muted"
        >
          {write.isPending
            ? 'Writing…'
            : info.voice_card
              ? 'Rewrite from my posts'
              : 'Write from my posts'}
        </button>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error.message}
          </p>
        )}
      </div>

      {info.platform === 'x' && <PremiumSetting info={info} />}

      <details className="mt-4 text-sm">
        <summary className="cursor-pointer text-muted">{label} rules</summary>
        <ul className="mt-2 flex flex-col gap-1">
          <li>Limit: {LIMIT.format(info.effective_limit)} characters</li>
          <li>Tone: {info.rules.tone_notes}</li>
          <li>Structure: {info.rules.structure_notes}</li>
        </ul>
      </details>
    </div>
  )
}

function Stat({ term, value }: { term: string; value: string }) {
  return (
    <div className="flex justify-between gap-2 border-b border-line py-1">
      <dt className="text-muted">{term}</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
    </div>
  )
}

/** Q31: the X limit is 280, or 25,000 with Premium. The user's answer wins. */
function PremiumSetting({ info }: { info: PlatformInfo }) {
  const set = useSetPremium()
  return (
    <fieldset className="mt-4 text-sm">
      <legend className="font-semibold">Does your X account have Premium?</legend>
      {info.premium_source === 'export' && (
        <p className="text-muted">Your export has long posts, so we guessed yes. Please confirm.</p>
      )}
      <div className="mt-2 flex gap-4">
        {[true, false].map((value) => (
          <label key={String(value)} className="flex min-h-10 items-center gap-2">
            <input
              type="radio"
              name="x-premium"
              checked={info.x_premium === value}
              disabled={set.isPending}
              onChange={() => set.mutate(value)}
            />
            {value ? 'Yes (up to 25,000)' : 'No (280)'}
          </label>
        ))}
      </div>
    </fieldset>
  )
}
