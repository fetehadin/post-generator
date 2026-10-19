import { postLength, type CountingRule } from '../lib/xCount'

type Props = { text: string; rule: CountingRule; limit: number }

/** "238 / 280". Amber within 10% of the limit, red over it; always words, never color alone. */
export function LengthCounter({ text, rule, limit }: Props) {
  const count = postLength(text, rule)
  const left = limit - count
  const state = left < 0 ? 'over' : left <= limit * 0.1 ? 'near' : 'ok'
  const color = { ok: 'text-muted', near: 'text-signal', over: 'text-danger' }[state]
  const note = { ok: '', near: ` · ${left} left`, over: ` · cut ${-left} characters` }[state]

  return (
    <span className={`text-sm tabular-nums ${color}`} data-state={state} aria-live="polite">
      {count.toLocaleString('en')} / {limit.toLocaleString('en')}
      {note}
    </span>
  )
}
