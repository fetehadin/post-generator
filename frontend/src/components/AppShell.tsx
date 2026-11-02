import { useEffect, useState, useSyncExternalStore } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'
import { useMe, useNotifications, useSetTimezone } from '../api/me'
import { useThreads } from '../api/threads'
import { cn } from '../lib/utils'
import { LABEL, PLATFORMS } from '../lib/platforms'
import { applyTheme, nextTheme, savedTheme, type Theme } from '../lib/theme'
import { Icon, type IconName } from './Icon'
import { needsAction, NotificationsPanel } from './NotificationsPanel'
import { PlatformMark } from './PlatformMark'
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from './ui/sheet'

const THEME_ICON: Record<Theme, IconName> = { light: 'sun', dark: 'moon' }
const NEXT: Record<Theme, Theme> = { light: 'dark', dark: 'light' }
const COLLAPSED_KEY = 'voxlace-sidebar-collapsed'
const DRAFTS_OPEN_KEY = 'voxlace-drafts-open'
const TZ_SENT_KEY = 'voxlace-timezone-sent'

function remembered(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key)
    return v === null ? fallback : v === '1'
  } catch {
    return fallback
  }
}

function remember(key: string, on: boolean) {
  try {
    localStorage.setItem(key, on ? '1' : '0')
  } catch {
    // private mode: remembered for this page only
  }
}

/**
 * DESIGN.md §2 (decided 22 Oct 2026). Left: a floating sidebar card with New chat, the chat
 * history, Drafts → X · LinkedIn · Telegram, Calendar, and at the bottom the collapse button
 * and the avatar → Profile. Right (1280px and up): Notifications and Missed, hidden when
 * empty; narrower, a bell opens the same panel. Mobile: a top bar and a bottom tab bar.
 */
export function AppShell() {
  const [theme, setTheme] = useState<Theme | null>(savedTheme)
  const [collapsed, setCollapsed] = useState(() => remembered(COLLAPSED_KEY, false))
  const me = useMe()
  const notifications = useNotifications().data
  const count = needsAction(notifications)
  // One panel at a time: beside the page from 1280px, behind the bell below that.
  const wide = useMedia('(min-width: 1280px)')
  useSendTimezoneOnce(me.data?.id, me.data?.timezone)

  const current: Theme =
    theme ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
  const name = (me.data?.email ?? '').split('@')[0] || 'You'
  const themeLabel = `Theme: ${current}. Switch to ${NEXT[current]}`

  function switchTheme() {
    const next = nextTheme(theme)
    applyTheme(next)
    setTheme(next)
  }

  function toggleCollapsed() {
    setCollapsed((c) => {
      remember(COLLAPSED_KEY, !c)
      return !c
    })
  }

  const themeButton = (
    <button
      type="button"
      onClick={switchTheme}
      aria-label={themeLabel}
      title={themeLabel}
      className="grid size-9 place-items-center rounded-control hover:bg-sunken"
    >
      <Icon name={THEME_ICON[current]} />
    </button>
  )

  return (
    <div
      className={cn(
        'min-h-screen md:grid',
        collapsed ? 'md:grid-cols-[88px_minmax(0,1fr)]' : 'md:grid-cols-[288px_minmax(0,1fr)]',
        count > 0 &&
          wide &&
          (collapsed
            ? 'xl:grid-cols-[88px_minmax(0,1fr)_300px]'
            : 'xl:grid-cols-[288px_minmax(0,1fr)_300px]'),
      )}
    >
      <aside className="sticky top-0 hidden h-screen p-3 md:block">
        <div className="flex h-full flex-col rounded-panel border border-line bg-paper">
          <div
            className={cn(
              'flex items-center border-b border-line p-4',
              collapsed ? 'flex-col gap-3' : 'justify-between',
            )}
          >
            <span className="text-xl font-semibold tracking-tight">
              {collapsed ? 'V' : 'Voxlace'}
            </span>
            <div className={cn('flex items-center gap-1', collapsed && 'flex-col')}>
              {count > 0 && !wide && <Bell count={count} />}
              {themeButton}
            </div>
          </div>

          <nav aria-label="Main" className="flex min-h-0 flex-1 flex-col gap-1 p-3">
            <NavItem to="/" icon="plus" label="New chat" collapsed={collapsed} end />
            {!collapsed && <ThreadList />}
            <DraftsGroup collapsed={collapsed} />
            <NavItem to="/calendar" icon="calendar" label="Calendar" collapsed={collapsed} />
          </nav>

          <div
            className={cn('flex gap-2 p-3', collapsed ? 'flex-col items-center' : 'items-center')}
          >
            <NavLink
              to="/profile"
              title={collapsed ? 'Profile' : undefined}
              className={({ isActive }) =>
                cn(
                  'flex min-w-0 flex-1 items-center gap-3 rounded-full',
                  collapsed ? 'justify-center' : 'bg-sunken p-2 pr-4',
                  isActive ? 'ring-1 ring-primary' : 'hover:ring-1 hover:ring-edge',
                )
              }
            >
              <span
                aria-hidden="true"
                className="grid size-10 flex-none place-items-center rounded-full bg-primary text-md font-semibold text-on-primary"
              >
                {name.charAt(0).toUpperCase()}
              </span>
              <span className={collapsed ? 'sr-only' : 'min-w-0 leading-tight'}>
                <span className="block truncate font-semibold">{name}</span>
                <span className="block text-sm text-muted">Profile &amp; settings</span>
              </span>
            </NavLink>
            <button
              type="button"
              onClick={toggleCollapsed}
              aria-expanded={!collapsed}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className="grid size-9 flex-none place-items-center rounded-control text-muted hover:bg-sunken hover:text-ink"
            >
              <Icon name={collapsed ? 'expand' : 'collapse'} />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile: the wordmark, the bell and the theme toggle. */}
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-paper px-4 py-2 md:hidden">
        <span className="text-xl font-semibold tracking-tight">Voxlace</span>
        <div className="flex items-center gap-1">
          {count > 0 && <Bell count={count} />}
          {themeButton}
        </div>
      </header>

      <main id="main" className="relative min-w-0 bg-paper pb-16 md:pb-0">
        <Outlet />
      </main>

      {count > 0 && wide && (
        <aside
          aria-label="Notifications and missed posts"
          className="sticky top-0 h-screen overflow-y-auto border-l border-line p-4"
        >
          <NotificationsPanel />
        </aside>
      )}

      <MobileTabs />
    </div>
  )
}

/** Whether a media query matches, kept up to date (e.g. the 1280px panel breakpoint). */
function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (change) => {
      const m = matchMedia(query)
      m.addEventListener('change', change)
      return () => m.removeEventListener('change', change)
    },
    () => matchMedia(query).matches,
  )
}

/**
 * The browser's zone is sent on first use (docs/API.md PATCH /me) while the account still
 * says UTC, once per account and browser. It counts as sent only when the server accepts it,
 * so a failed or refused request is tried again next time.
 */
function useSendTimezoneOnce(userId: string | undefined, saved: string | undefined) {
  const setZone = useSetTimezone()
  useEffect(() => {
    const browser = Intl.DateTimeFormat().resolvedOptions().timeZone
    const key = `${TZ_SENT_KEY}:${userId}`
    if (!userId || saved !== 'UTC' || !browser || browser === 'UTC' || remembered(key, false))
      return
    setZone.mutate(browser, { onSuccess: () => remember(key, true) })
    // setZone is a new object each render; only the account and its saved zone decide.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, saved])
}

function NavItem({
  to,
  icon,
  label,
  collapsed,
  end = false,
}: {
  to: string
  icon: IconName
  label: string
  collapsed: boolean
  end?: boolean
}) {
  return (
    <NavLink
      to={to}
      end={end}
      title={collapsed ? label : undefined}
      className={({ isActive }) =>
        cn(
          'flex min-h-11 flex-none items-center gap-3 rounded-control text-md text-ink',
          collapsed ? 'justify-center' : 'px-3',
          isActive ? 'bg-sunken font-semibold' : 'hover:bg-sunken',
        )
      }
    >
      <Icon name={icon} />
      <span className={collapsed ? 'sr-only' : ''}>{label}</span>
    </NavLink>
  )
}

/** Past chats, newest first (like ChatGPT's history). Scrolls on its own. */
function ThreadList() {
  const threads = useThreads().data?.items ?? []
  return (
    <section aria-labelledby="chats-title" className="flex min-h-0 flex-col">
      <h2 id="chats-title" className="px-3 pt-3 pb-1 text-sm text-muted">
        Chats
      </h2>
      {threads.length === 0 ? (
        <p className="px-3 text-sm text-muted">Your chats will appear here.</p>
      ) : (
        <ul className="max-h-[40vh] min-h-0 overflow-y-auto">
          {threads.map((t) => (
            <li key={t.id}>
              <NavLink
                to={`/chat/${t.id}`}
                title={t.title}
                className={({ isActive }) =>
                  cn(
                    'block min-h-9 truncate rounded-control px-3 py-2 text-sm',
                    isActive ? 'bg-sunken font-semibold' : 'hover:bg-sunken',
                  )
                }
              >
                {t.title}
              </NavLink>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** Drafts opens to X · LinkedIn · Telegram (DESIGN.md §2). Remembered per browser. */
function DraftsGroup({ collapsed }: { collapsed: boolean }) {
  const onDrafts = useLocation().pathname.startsWith('/drafts')
  const [open, setOpen] = useState(() => remembered(DRAFTS_OPEN_KEY, true))
  if (collapsed)
    return (
      <NavLink
        to="/drafts/x"
        title="Drafts"
        className={cn(
          'flex min-h-11 flex-none items-center justify-center rounded-control',
          onDrafts ? 'bg-sunken font-semibold' : 'hover:bg-sunken',
        )}
      >
        <Icon name="drafts" />
        <span className="sr-only">Drafts</span>
      </NavLink>
    )
  return (
    <div className="flex-none">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="drafts-platforms"
        onClick={() => {
          remember(DRAFTS_OPEN_KEY, !open)
          setOpen(!open)
        }}
        className={cn(
          'flex min-h-11 w-full items-center gap-3 rounded-control px-3 text-md hover:bg-sunken',
          onDrafts && 'font-semibold',
        )}
      >
        <Icon name="drafts" />
        Drafts
        <Icon name={open ? 'chevron-down' : 'chevron-right'} className="ml-auto size-4" />
      </button>
      {open && (
        <ul id="drafts-platforms" className="ml-6 border-l border-line pl-2">
          {PLATFORMS.map((p) => (
            <li key={p}>
              <NavLink
                to={`/drafts/${p}`}
                className={({ isActive }) =>
                  cn(
                    'flex min-h-9 items-center gap-2 rounded-control px-2 text-sm',
                    isActive ? 'bg-sunken font-semibold' : 'hover:bg-sunken',
                  )
                }
              >
                <PlatformMark platform={p} />
                {LABEL[p]}
              </NavLink>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Below 1280px the panel lives behind a bell (DESIGN.md §2). */
function Bell({ count, className }: { count: number; className?: string }) {
  const label = count === 1 ? '1 thing needs you' : `${count} things need you`
  return (
    <Sheet>
      <SheetTrigger
        aria-label={label}
        title={label}
        className={cn(
          'relative grid size-9 place-items-center rounded-control text-signal hover:bg-sunken',
          className,
        )}
      >
        <Icon name="bell" />
        {/* The signal fill with --on-primary text: 5.8:1 light, 8.3:1 dark (DESIGN.md §5). */}
        <span className="absolute top-1 right-1 grid min-w-4 place-items-center rounded-full bg-signal px-1 text-xs leading-4 font-semibold text-on-primary">
          {count}
        </span>
      </SheetTrigger>
      <SheetContent className="w-[min(100%,340px)] overflow-y-auto p-4">
        <SheetTitle className="text-xl tracking-tight">Notifications</SheetTitle>
        <SheetDescription className="sr-only">
          Posts due now, missed posts and today's check-in.
        </SheetDescription>
        <NotificationsPanel />
      </SheetContent>
    </Sheet>
  )
}

function MobileTabs() {
  const tabs: Array<{ to: string; label: string; icon: IconName; end?: boolean }> = [
    { to: '/', label: 'Chat', icon: 'chat', end: true },
    { to: '/drafts/x', label: 'Drafts', icon: 'drafts' },
    { to: '/calendar', label: 'Calendar', icon: 'calendar' },
    { to: '/profile', label: 'Profile', icon: 'user' },
  ]
  const path = useLocation().pathname
  // Drafts covers every platform's page; Chat covers New chat and every thread.
  const active = (label: string) =>
    label === 'Drafts' ? path.startsWith('/drafts') : label === 'Chat' && path.startsWith('/chat/')
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-4 border-t border-line bg-paper md:hidden"
    >
      {tabs.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end={t.end}
          className={({ isActive }) =>
            cn(
              'flex min-h-14 flex-col items-center justify-center gap-1 text-xs',
              isActive || active(t.label) ? 'font-semibold text-ink' : 'text-muted',
            )
          }
        >
          <Icon name={t.icon} />
          {t.label}
        </NavLink>
      ))}
    </nav>
  )
}
