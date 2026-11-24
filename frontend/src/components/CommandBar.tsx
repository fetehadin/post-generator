import { useEffect, useId, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { useThreads } from '../api/threads'
import { cn } from '../lib/utils'
import { Icon, type IconName } from './Icon'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './ui/dialog'

/** One thing the bar can do: go somewhere or run something. */
type Item = { id: string; label: string; group: string; icon: IconName; run: () => void }

/** Ctrl on Windows and Linux, ⌘ on a Mac: the same shortcut either way. */
export const MOD =
  typeof navigator !== 'undefined' && /Mac|iP/.test(navigator.platform) ? '⌘' : 'Ctrl'

/**
 * The command bar (FR-51, DESIGN.md §6): Ctrl/⌘+K opens one search box over every place and a
 * few actions (new chat, drafts, calendar, each Profile tab, recent chats, switch the theme).
 * Type to narrow, arrows to move, Enter to go, Esc to close. Ctrl/⌘+J jumps to the page's
 * message box instead (the composer or "Ask for a change"). Nothing here posts or approves
 * anything (rule 4): it only moves you around.
 */
export function CommandBar({
  open,
  onOpenChange,
  onSwitchTheme,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSwitchTheme: () => void
}) {
  const navigate = useNavigate()
  const threads = useThreads().data?.items ?? []
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const listId = useId()

  const items = useMemo<Item[]>(() => {
    const go = (path: string) => () => navigate(path)
    return [
      { id: 'new', label: 'New chat', group: 'Go to', icon: 'plus', run: go('/') },
      { id: 'dx', label: 'X drafts', group: 'Go to', icon: 'drafts', run: go('/drafts/x') },
      {
        id: 'dl',
        label: 'LinkedIn drafts',
        group: 'Go to',
        icon: 'drafts',
        run: go('/drafts/linkedin'),
      },
      {
        id: 'dt',
        label: 'Telegram drafts',
        group: 'Go to',
        icon: 'drafts',
        run: go('/drafts/telegram'),
      },
      { id: 'cal', label: 'Calendar', group: 'Go to', icon: 'calendar', run: go('/calendar') },
      { id: 'ci', label: 'Past check-ins', group: 'Go to', icon: 'chat', run: go('/checkins') },
      { id: 'imp', label: 'Import your posts', group: 'Go to', icon: 'plus', run: go('/import') },
      ...(
        [
          ['about', 'Profile: About you'],
          ['audience', 'Profile: Audience & timing'],
          ['voice', 'Profile: Voice & posts'],
          ['connections', 'Profile: Connections (free key, Telegram, GitHub)'],
          ['account', 'Profile: Account'],
        ] as const
      ).map(([tab, label]) => ({
        id: `p-${tab}`,
        label,
        group: 'Profile',
        icon: 'user' as const,
        run: go(`/profile?tab=${tab}`),
      })),
      {
        id: 'theme',
        label: 'Switch light / dark theme',
        group: 'Actions',
        icon: 'moon',
        run: onSwitchTheme,
      },
      ...threads.slice(0, 8).map((t) => ({
        id: `t-${t.id}`,
        label: t.title,
        group: 'Recent chats',
        icon: 'chat' as const,
        run: go(`/chat/${t.id}`),
      })),
    ]
  }, [navigate, onSwitchTheme, threads])

  // Every opening starts empty, however it was closed (Enter, Esc, the shortcut again).
  useEffect(() => {
    if (open) {
      setQuery('')
      setActive(0)
    }
  }, [open])

  const shown = filterItems(items, query)
  const current = shown[Math.min(active, shown.length - 1)]

  function choose(item: Item | undefined) {
    if (!item) return
    onOpenChange(false)
    item.run()
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o)
        setQuery('')
        setActive(0)
      }}
    >
      <DialogContent showCloseButton={false} className="top-[15%] translate-y-0 gap-0 p-0">
        <DialogTitle className="sr-only">Go to</DialogTitle>
        <DialogDescription className="sr-only">
          Type to search places and actions, then press Enter.
        </DialogDescription>
        <div className="flex items-center gap-2 border-b border-line px-4">
          <Icon name="search" className="size-4 text-muted" />
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0)
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault()
                const step = e.key === 'ArrowDown' ? 1 : -1
                setActive((a) => (a + step + shown.length) % Math.max(shown.length, 1))
              } else if (e.key === 'Enter') {
                e.preventDefault()
                choose(current)
              }
            }}
            role="combobox"
            aria-expanded
            aria-controls={listId}
            aria-activedescendant={current ? `${listId}-${current.id}` : undefined}
            aria-label="Search places and actions"
            placeholder="Go to…"
            className="min-h-12 flex-1 bg-transparent text-md outline-none placeholder:text-muted"
          />
        </div>
        <ul
          id={listId}
          role="listbox"
          aria-label="Places and actions"
          className="max-h-[60vh] overflow-y-auto overscroll-contain p-2"
        >
          {shown.length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-muted">Nothing matches.</li>
          )}
          {shown.map((item, i) => (
            <li key={item.id} role="presentation">
              {(i === 0 || shown[i - 1].group !== item.group) && (
                <p aria-hidden="true" className="px-3 pt-3 pb-1 text-xs text-muted">
                  {item.group}
                </p>
              )}
              <div
                id={`${listId}-${item.id}`}
                role="option"
                aria-selected={item === current}
                onMouseMove={() => setActive(i)}
                onClick={() => choose(item)}
                className={cn(
                  'flex min-h-10 cursor-pointer items-center gap-3 rounded-control px-3 text-sm',
                  item === current && 'bg-sunken',
                )}
              >
                <Icon name={item.icon} className="size-4 flex-none text-muted" />
                <span className="truncate">{item.label}</span>
              </div>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  )
}

/** Every typed word must appear in the label, in any order: "tele dra" finds Telegram drafts. */
export function filterItems<T extends { label: string; group: string }>(items: T[], query: string) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return items
  return items.filter((i) => {
    const hay = `${i.label} ${i.group}`.toLowerCase()
    return words.every((w) => hay.includes(w))
  })
}

/**
 * The global shortcuts: Ctrl/⌘+K toggles the bar; Ctrl/⌘+J focuses the page's message box
 * (the last visible one, so a chat's "Ask for a change" wins over anything above it).
 */
export function useCommandShortcuts(toggle: () => void) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return
      // e.code is the physical key, so the shortcut also works on Amharic or other layouts.
      const key = e.code === 'KeyK' ? 'k' : e.code === 'KeyJ' ? 'j' : e.key.toLowerCase()
      if (key === 'k') {
        e.preventDefault()
        toggle()
      } else if (key === 'j') {
        const boxes = [...document.querySelectorAll<HTMLElement>('[data-composer]')]
        const visible = boxes.filter((el) => el.getClientRects().length > 0)
        const box = (visible.length ? visible : boxes).at(-1)
        if (box) {
          e.preventDefault()
          box.focus()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggle])
}
