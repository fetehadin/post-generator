import { useState } from 'react'
import { PROFESSION_LIST_ID, PROFESSION_SUGGESTIONS } from '../../lib/profession'

/** "student, developer" ↔ ["student", "developer"]: the server keeps one comma-separated text. */
export const splitProfessions = (value: string): string[] =>
  value
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)

/**
 * Profession as chips (FR-53): pick from the list or type your own, as many as you are
 * ("student" and "developer"). Enter, a comma or leaving the field adds what was typed;
 * Backspace in the empty field removes the last one.
 */
export function ProfessionInput({
  id,
  value,
  onChange,
  onTyping,
}: {
  id: string
  value: string
  onChange: (value: string) => void
  /** What is typed but not yet a chip, so the form can count it as a change and save it. */
  onTyping?: (text: string) => void
}) {
  const chosen = splitProfessions(value)
  const [typed, setTypedState] = useState('')
  const setTyped = (text: string) => {
    setTypedState(text)
    onTyping?.(text)
  }

  const add = (text: string) => {
    const fresh = splitProfessions(text).filter(
      (p) => !chosen.some((c) => c.toLowerCase() === p.toLowerCase()),
    )
    if (fresh.length) onChange([...chosen, ...fresh].join(', '))
    setTyped('')
  }
  const remove = (p: string) => onChange(chosen.filter((c) => c !== p).join(', '))

  return (
    <div className="mt-1 flex min-h-10 w-full flex-wrap items-center gap-1.5 rounded-control border border-edge bg-surface px-2 py-1 focus-within:border-ink">
      {chosen.map((p) => (
        <span
          key={p}
          className="inline-flex items-center gap-1 rounded-full bg-sunken py-0.5 pr-1 pl-3 text-sm"
        >
          {p}
          <button
            type="button"
            onClick={() => remove(p)}
            aria-label={`Remove ${p}`}
            className="inline-flex size-7 items-center justify-center rounded-full text-muted hover:text-ink"
          >
            ×
          </button>
        </span>
      ))}
      <input
        id={id}
        value={typed}
        list={PROFESSION_LIST_ID}
        onChange={(e) => {
          const v = e.target.value
          // Picking from the list fills the whole word at once: take it straight away.
          if (v.endsWith(',') || PROFESSION_SUGGESTIONS.includes(v)) add(v)
          else setTyped(v)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && typed.trim()) {
            e.preventDefault() // add the chip, don't submit the form
            add(typed)
          } else if (e.key === 'Backspace' && !typed && chosen.length) {
            remove(chosen[chosen.length - 1])
          }
        }}
        onBlur={() => typed.trim() && add(typed)}
        placeholder={chosen.length ? 'Add another…' : 'Teacher, nurse, designer, developer…'}
        aria-describedby={`${id}-help`}
        className="min-h-8 min-w-32 flex-1 bg-transparent px-1 text-sm outline-none"
      />
      <datalist id={PROFESSION_LIST_ID}>
        {PROFESSION_SUGGESTIONS.filter((s) => !chosen.includes(s)).map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>
      <span id={`${id}-help`} className="sr-only">
        Add as many as fit you, for example student and developer.
      </span>
    </div>
  )
}
