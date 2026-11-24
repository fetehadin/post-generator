import { type ReactNode, useId, useState } from 'react'
import type { Platform } from '../api/types'
import { LABEL, PLATFORMS } from '../lib/platforms'
import { chip, chipOn, iconButton } from '../lib/ui'
import { cn } from '../lib/utils'
import { Icon } from './Icon'
import { PlatformMark } from './PlatformMark'
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from './ui/dropdown-menu'
import { Kbd, Tooltip } from './ui/tooltip'

/** A "/" command: type /name, then Enter (or pick it from the list). */
export type Command = { name: string; hint: string; run: () => void }

/**
 * The message box (DESIGN.md §4.1, §6): one auto-growing input, Enter sends and Shift+Enter
 * starts a new line, the platform chips sit inside the box, everything else hides behind one
 * Options control. Typing "/" lists commands for power users. Nothing typed is ever cleared
 * on failure: the parent owns the text (NFR-4).
 */
export function Composer({
  label,
  value,
  onChange,
  onSubmit,
  canSubmit,
  busy = false,
  placeholder,
  sendLabel,
  platforms,
  commands = [],
  options,
  onStop,
  rows = 1,
  id,
  menu = 'above',
  maxLength,
}: {
  /** The box's accessible name; render a visible label elsewhere with htmlFor={id}. */
  label?: string
  value: string
  onChange: (text: string) => void
  onSubmit: () => void
  canSubmit: boolean
  busy?: boolean
  placeholder: string
  sendLabel: string
  platforms?: { value: Platform[]; onChange: (p: Platform[]) => void }
  commands?: Command[]
  /** Items for the Options menu (DropdownMenuItem); hidden when there are none. */
  options?: ReactNode
  /** While busy: shows Stop instead of Send. */
  onStop?: () => void
  rows?: number
  id?: string
  /** Where "/" commands open: below a box near the top of the page, above one at the bottom. */
  menu?: 'above' | 'below'
  /** The longest text the API accepts, so a long paste stops here instead of failing later. */
  maxLength?: number
}) {
  const ownId = useId()
  const boxId = id ?? ownId
  const listId = `${boxId}-commands`
  const [active, setActive] = useState(0)
  const [hideCommands, setHideCommands] = useState(false)

  // Commands show while the box holds only "/word" (no spaces or new lines yet).
  const query = /^\/\S*$/.test(value) ? value.slice(1).toLowerCase() : null
  const matches = query === null ? [] : commands.filter((c) => c.name.startsWith(query))
  const showCommands = matches.length > 0 && !hideCommands
  const current = matches[Math.min(active, matches.length - 1)]
  // Nothing but Send: it sits beside the text, so the box stays one line tall.
  const inline = !platforms && !options

  function run(c: Command) {
    onChange('')
    setActive(0)
    c.run()
  }

  return (
    <div className="relative">
      {showCommands && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Commands"
          className={cn(
            'absolute inset-x-0 z-20 max-h-64 overflow-y-auto overscroll-contain rounded-panel border border-line bg-composer p-1 shadow-float',
            menu === 'above' ? 'bottom-full mb-2' : 'top-full mt-2',
          )}
        >
          {matches.map((c, i) => (
            <li
              key={c.name}
              id={`${listId}-${c.name}`}
              role="option"
              aria-selected={c === current}
              // A pointer pick must not blur the box first.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => run(c)}
              onMouseEnter={() => setActive(i)}
              className={cn(
                'flex min-h-10 cursor-pointer items-baseline gap-3 rounded-control px-3 py-2 text-sm',
                c === current && 'bg-sunken',
              )}
            >
              <span className="font-mono">/{c.name}</span>
              <span className="text-muted">{c.hint}</span>
            </li>
          ))}
        </ul>
      )}
      <form
        className={cn(
          'rounded-composer border border-line bg-composer shadow-composer transition-colors duration-(--duration) focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-thread',
          inline ? 'flex items-end gap-2 py-1.5 pr-1.5 pl-3' : 'px-3 pt-2.5 pb-2',
        )}
        onSubmit={(e) => {
          e.preventDefault()
          if (canSubmit && !busy) onSubmit()
        }}
      >
        <textarea
          id={boxId}
          // Ctrl/⌘+J finds the page's message box by this (CommandBar, FR-51).
          data-composer
          aria-label={label}
          value={value}
          rows={rows}
          maxLength={maxLength}
          role={commands.length ? 'combobox' : undefined}
          aria-expanded={commands.length ? showCommands : undefined}
          aria-controls={showCommands ? listId : undefined}
          aria-autocomplete={commands.length ? 'list' : undefined}
          aria-activedescendant={showCommands && current ? `${listId}-${current.name}` : undefined}
          onChange={(e) => {
            onChange(e.target.value)
            setHideCommands(false)
            setActive(0)
          }}
          onKeyDown={(e) => {
            if (showCommands) {
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault()
                const step = e.key === 'ArrowDown' ? 1 : -1
                setActive((a) => (a + step + matches.length) % matches.length)
                return
              }
              if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Tab') {
                e.preventDefault()
                if (current) run(current)
                return
              }
              if (e.key === 'Escape') {
                e.preventDefault()
                setHideCommands(true)
                return
              }
            }
            // Enter sends; Shift+Enter is a new line; never mid-way through IME input.
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              if (canSubmit && !busy) onSubmit()
            }
          }}
          placeholder={placeholder}
          className="block max-h-[40vh] w-full resize-none bg-transparent px-2 py-1.5 text-md leading-writing outline-none [field-sizing:content] placeholder:text-muted"
        />
        <div className={cn('flex items-center gap-1.5', inline ? 'flex-none' : 'mt-1')}>
          {platforms && <PlatformChips {...platforms} />}
          <div className="ml-auto flex items-center gap-1">
            {options && (
              <DropdownMenu>
                <Tooltip content="Options">
                  <DropdownMenuTrigger aria-label="Options" className={iconButton}>
                    <Icon name="sliders" />
                  </DropdownMenuTrigger>
                </Tooltip>
                <DropdownMenuContent align="end" className="min-w-56">
                  {options}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {busy && onStop ? (
              <Tooltip content="Stop waiting">
                <button
                  type="button"
                  onClick={onStop}
                  aria-label="Stop"
                  className="grid size-10 flex-none place-items-center rounded-full bg-primary text-on-primary"
                >
                  <Icon name="stop" className="size-4 fill-current" />
                </button>
              </Tooltip>
            ) : (
              <Tooltip
                content={
                  <>
                    {sendLabel}
                    <Kbd>Enter</Kbd>
                  </>
                }
              >
                <button
                  type="submit"
                  aria-label={sendLabel}
                  aria-disabled={!canSubmit || busy}
                  className={cn(
                    'grid size-10 flex-none place-items-center rounded-full bg-primary text-on-primary transition-opacity duration-(--duration)',
                    (!canSubmit || busy) && 'cursor-not-allowed opacity-30',
                  )}
                >
                  <Icon name="arrow-up" />
                </button>
              </Tooltip>
            )}
          </div>
        </div>
      </form>
    </div>
  )
}

/** X / LinkedIn / Telegram toggles inside the box; remembers nothing itself. */
export function PlatformChips({
  value,
  onChange,
}: {
  value: Platform[]
  onChange: (p: Platform[]) => void
}) {
  return (
    <div role="group" aria-label="Write for" className="flex flex-wrap items-center gap-1.5">
      {PLATFORMS.map((p) => {
        const on = value.includes(p)
        return (
          <button
            key={p}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((x) => x !== p) : [...value, p])}
            className={cn(chip, 'min-h-8 px-2.5', on && chipOn)}
          >
            <PlatformMark platform={p} />
            {/* Phones show the marks only; the name stays for screen readers. */}
            <span className="max-sm:sr-only">{LABEL[p]}</span>
          </button>
        )
      })}
    </div>
  )
}
