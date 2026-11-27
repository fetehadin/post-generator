import { useCallback, useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'
import { useMe, useNotifications, useSetTimezone } from '../api/me'
import { remember, remembered } from '../lib/storage'
import { useMedia } from '../lib/useMedia'
import { cn } from '../lib/utils'
import { LABEL, PLATFORMS } from '../lib/platforms'
import { applyTheme, nextTheme, savedTheme, type Theme } from '../lib/theme'
import { StrengthRing } from './StrengthRing'
import { ChatList } from './ChatList'
import { Icon, type IconName } from './Icon'
import { needsAction, NotificationsPanel } from './NotificationsPanel'
import { PlatformMark } from './PlatformMark'
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from './ui/sheet'
import { LogoMark, Wordmark } from './Logo'
import { Kbd, Tooltip } from './ui/tooltip'
import { CommandBar, MOD, useCommandShortcuts } from './CommandBar'

// The icon shows where a click takes you: a moon in light mode, a sun in dark mode.
const THEME_ICON: Record<Theme, IconName> = { light: 'moon', dark: 'sun' }
const NEXT: Record<Theme, Theme> = { light: 'dark', dark: 'light' }
const COLLAPSED_KEY = 'voxlace-sidebar-collapsed'
const DRAFTS_OPEN_KEY = 'voxlace-drafts-open'
const TZ_SENT_KEY = 'voxlace-timezone-sent'

/**
 * DESIGN.md §2 (decided 22 Oct 2026; restyled 20 Nov 2026; bell only, 21 Nov 2026). Left: a
 * flat, full-height sidebar with New chat, the chat history, Drafts → X · LinkedIn · Telegram,
 * Calendar, and at the bottom the collapse button and the avatar → Profile. Notifications and
 * missed posts open from a bell, at every width, so the page keeps its room. Mobile: a top bar
 * and a bottom tab bar.
 */
export function AppShell() {
  const [theme, setTheme] = useState<Theme | null>(savedTheme)
  const [collapsed, setCollapsed] = useState(() => remembered(COLLAPSED_KEY, false))
  const me = useMe()
  const notifications = useNotifications().data
  const count = needsAction(notifications)
  useSendTimezoneOnce(me.data?.id, me.data?.timezone)
  const [goOpen, setGoOpen] = useState(false)
  useCommandShortcuts(useCallback(() => setGoOpen((o) => !o), []))

  // Follows the system theme live, so the icon is right after the OS switches too.
  const systemDark = useMedia('(prefers-color-scheme: dark)')
  const current: Theme = theme ?? (systemDark ? 'dark' : 'light')
  const name = (me.data?.email ?? '').split('@')[0] || 'You'
  const themeLabel = `Theme: ${current}. Switch to ${NEXT[current]}`

  const switchTheme = useCallback(() => {
    setTheme((t) => {
      const next = nextTheme(t)
      applyTheme(next)
      return next
    })
  }, [])

  const goButton = (
    <Tooltip
      content={
        <>
          Go to anything <Kbd>{MOD}</Kbd>
          <Kbd>K</Kbd>
        </>
      }
    >
      <button
        type="button"
        onClick={() => setGoOpen(true)}
        aria-label="Go to anything"
        aria-keyshortcuts="Control+K Meta+K"
        className="grid size-9 place-items-center rounded-control text-muted hover:bg-sunken hover:text-ink"
      >
        <Icon name="search" />
      </button>
    </Tooltip>
  )

  function toggleCollapsed() {
    setCollapsed((c) => {
      remember(COLLAPSED_KEY, !c)
      return !c
    })
  }

  const themeButton = (
    <Tooltip content={themeLabel}>
      <button
        type="button"
        onClick={switchTheme}
        aria-label={themeLabel}
        className="grid size-9 place-items-center rounded-control text-muted hover:bg-sunken hover:text-ink"
      >
        <Icon name={THEME_ICON[current]} />
      </button>
    </Tooltip>
  )

  return (
    <div
      className={cn(
        'min-h-screen md:grid',
        collapsed ? 'md:grid-cols-[88px_minmax(0,1fr)]' : 'md:grid-cols-[284px_minmax(0,1fr)]',
      )}
    >
      {/* Keyboard users jump past the sidebar (WCAG 2.4.1). */}
      <a
        href="#main"
        className="sr-only z-50 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-on-primary focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      {/* A floating panel with rounded corners on the page, open or as an icon rail. */}
      <aside className="sticky top-0 hidden h-screen bg-paper p-3 md:block">
        <div className="flex h-full flex-col overflow-hidden rounded-[20px] border border-line bg-sidebar shadow-composer">
          <div
            className={cn(
              'flex items-center border-b border-line px-3 py-3',
              collapsed ? 'flex-col gap-2' : 'justify-between pl-4',
            )}
          >
            <span className="text-ink">
              {collapsed ? <LogoMark className="size-6" /> : <Wordmark className="h-6 w-auto" />}
            </span>
            <div className={cn('flex items-center gap-1', collapsed && 'flex-col')}>
              {count > 0 && <Bell count={count} />}
              {goButton}
              {themeButton}
            </div>
          </div>

          <nav
            aria-label="Main"
            className={cn(
              'flex min-h-0 flex-1 flex-col gap-1 px-2 py-3',
              collapsed && 'items-center',
            )}
          >
            <NavItem to="/" icon="plus" label="New chat" collapsed={collapsed} end />
            {!collapsed && <ChatList />}
            <DraftsGroup collapsed={collapsed} />
            <NavItem to="/calendar" icon="calendar" label="Calendar" collapsed={collapsed} />
          </nav>

          <div
            className={cn('flex gap-1 p-2', collapsed ? 'flex-col items-center' : 'items-center')}
          >
            <Tip content="Profile" show={collapsed}>
              <NavLink
                to="/profile"
                className={({ isActive }) =>
                  cn(
                    'flex min-w-0 flex-1 items-center gap-3 rounded-full p-1.5 transition-colors duration-(--duration) ease-(--ease)',
                    collapsed ? 'justify-center' : 'bg-bubble pr-3',
                    isActive ? 'bg-sunken' : 'hover:bg-sunken',
                  )
                }
              >
                <StrengthRing>
                  <span
                    aria-hidden="true"
                    className="grid size-8 flex-none place-items-center rounded-full bg-primary text-sm font-semibold text-on-primary"
                  >
                    {name.charAt(0).toUpperCase()}
                  </span>
                </StrengthRing>
                <span className={collapsed ? 'sr-only' : 'min-w-0 leading-tight'}>
                  <span className="block truncate text-sm font-semibold">{name}</span>
                  <span className="block text-xs text-muted">Profile &amp; settings</span>
                </span>
              </NavLink>
            </Tip>
            <Tooltip content={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
              <button
                type="button"
                onClick={toggleCollapsed}
                aria-expanded={!collapsed}
                aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                className="grid size-9 flex-none place-items-center rounded-control text-muted hover:bg-sunken hover:text-ink"
              >
                <Icon name={collapsed ? 'expand' : 'collapse'} />
              </button>
            </Tooltip>
          </div>
        </div>
      </aside>

      {/* Mobile: the wordmark, the bell and the theme toggle. */}
      <header className="sticky top-0 z-10 flex items-center justify-between bg-paper px-4 py-2 md:hidden">
        <Wordmark className="h-5 w-auto text-ink" />
        <div className="flex items-center gap-1">
          {count > 0 && <Bell count={count} />}
          {goButton}
          {themeButton}
        </div>
      </header>

      <main
        id="main"
        tabIndex={-1}
        className="relative min-w-0 bg-paper pb-16 outline-none md:pb-0"
      >
        <Outlet />
      </main>

      <MobileTabs />
      <CommandBar open={goOpen} onOpenChange={setGoOpen} onSwitchTheme={switchTheme} />
    </div>
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
    <Tip content={label} show={collapsed}>
      <NavLink
        to={to}
        end={end}
        className={({ isActive }) =>
          cn(
            'flex min-h-10 flex-none items-center gap-3 rounded-control text-md text-ink transition-colors duration-(--duration) ease-(--ease)',
            collapsed ? 'size-10 justify-center' : 'px-3',
            isActive ? 'bg-sunken' : 'hover:bg-sunken',
          )
        }
      >
        <Icon name={icon} />
        <span className={collapsed ? 'sr-only' : ''}>{label}</span>
      </NavLink>
    </Tip>
  )
}

/** Drafts opens to X · LinkedIn · Telegram (DESIGN.md §2). Remembered per browser. */
function DraftsGroup({ collapsed }: { collapsed: boolean }) {
  const onDrafts = useLocation().pathname.startsWith('/drafts')
  const [open, setOpen] = useState(() => remembered(DRAFTS_OPEN_KEY, true))
  if (collapsed)
    return (
      <Tooltip content="Drafts" side="right">
        <NavLink
          to="/drafts/x"
          className={cn(
            'flex size-10 flex-none items-center justify-center rounded-control',
            onDrafts ? 'bg-sunken' : 'hover:bg-sunken',
          )}
        >
          <Icon name="drafts" />
          <span className="sr-only">Drafts</span>
        </NavLink>
      </Tooltip>
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
          'flex min-h-10 w-full items-center gap-3 rounded-control px-3 text-md hover:bg-sunken',
        )}
      >
        <Icon name="drafts" />
        Drafts
        <Icon name={open ? 'chevron-down' : 'chevron-right'} className="ml-auto size-4" />
      </button>
      {open && (
        <ul id="drafts-platforms" className="mt-1 ml-5 flex gap-1 border-l border-line pl-3">
          {PLATFORMS.map((p) => (
            <li key={p}>
              <Tooltip content={LABEL[p]}>
                <NavLink
                  to={`/drafts/${p}`}
                  className={({ isActive }) =>
                    cn(
                      'grid size-10 place-items-center rounded-control transition-colors duration-(--duration) ease-(--ease)',
                      isActive ? 'bg-sunken' : 'hover:bg-sunken',
                    )
                  }
                >
                  {/* The logo is the name (product owner, 27 Nov 2026); screen readers hear it. */}
                  <PlatformMark platform={p} className="size-5" />
                  <span className="sr-only">{LABEL[p]} drafts</span>
                </NavLink>
              </Tooltip>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Notifications and missed posts live behind a bell (DESIGN.md §2). */
function Bell({ count, className }: { count: number; className?: string }) {
  const label = count === 1 ? '1 thing needs you' : `${count} things need you`
  return (
    <Sheet>
      <SheetTrigger
        aria-label={label}
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
      className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-4 border-t border-line bg-sidebar md:hidden"
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

/** A tooltip only when the label is hidden (the collapsed rail); otherwise just the child. */
function Tip({
  content,
  show,
  children,
}: {
  content: string
  show: boolean
  children: React.ReactElement
}) {
  // The tooltip sits on a wrapper: NavLink's className is a function, which the tooltip's
  // trigger can't merge into.
  return show ? (
    <Tooltip content={content} side="right">
      <span className="flex justify-center">{children}</span>
    </Tooltip>
  ) : (
    children
  )
}
