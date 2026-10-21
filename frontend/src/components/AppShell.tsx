import { useState } from 'react'
import { NavLink, Outlet } from 'react-router'
import { useMe } from '../api/me'
import { applyTheme, nextTheme, savedTheme, type Theme } from '../lib/theme'
import { Icon, type IconName } from './Icon'

const PLACES: Array<{ to: string; label: string; icon: IconName }> = [
  { to: '/', label: 'Home', icon: 'home' },
  { to: '/calendar', label: 'Calendar', icon: 'calendar' },
  { to: '/drafts', label: 'Drafts', icon: 'drafts' },
]

const THEME_ICON: Record<Theme, IconName> = { light: 'sun', dark: 'moon', mixed: 'mixed' }
const NEXT: Record<Theme, Theme> = { light: 'dark', dark: 'mixed', mixed: 'light' }
const COLLAPSED_KEY = 'voxlace-sidebar-collapsed'

function savedCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * DESIGN.md §2 (decided 21 Oct 2026), styled after the product owner's reference: the theme
 * icon sits in the sidebar header next to the wordmark, the collapse button sits just
 * outside the sidebar, and the profile card is at the bottom. Mobile: a bottom tab bar.
 */
export function AppShell() {
  const [theme, setTheme] = useState<Theme | null>(savedTheme)
  const [collapsed, setCollapsed] = useState(savedCollapsed)
  const me = useMe()

  const current: Theme =
    theme ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
  const email = me.data?.email ?? ''
  const name = email.split('@')[0] || 'You'

  function switchTheme() {
    const next = nextTheme(theme)
    applyTheme(next)
    setTheme(next)
  }

  function toggleCollapsed() {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSED_KEY, c ? '0' : '1')
      } catch {
        // private mode: remembered for this page only
      }
      return !c
    })
  }

  const themeLabel = `Theme: ${current}. Switch to ${NEXT[current]}`
  const item = (active: boolean) =>
    `flex min-h-11 items-center gap-3 rounded-control text-md ${collapsed ? 'justify-center' : 'px-3'} ${
      active ? 'bg-sunken font-semibold text-ink' : 'text-ink hover:bg-sunken'
    }`

  return (
    <div
      className={`min-h-screen md:grid ${
        collapsed ? 'md:grid-cols-[88px_minmax(0,1fr)]' : 'md:grid-cols-[288px_minmax(0,1fr)]'
      }`}
    >
      <aside className="sticky top-0 hidden h-screen p-3 md:block">
        <div className="flex h-full flex-col rounded-panel border border-line bg-paper shadow-[0_1px_2px_rgb(0_0_0/0.04)]">
          <div
            className={`flex items-center border-b border-line p-4 ${
              collapsed ? 'flex-col gap-3' : 'justify-between'
            }`}
          >
            <span className="text-xl font-semibold tracking-tight">
              {collapsed ? 'V' : 'Voxlace'}
            </span>
            <button
              type="button"
              onClick={switchTheme}
              aria-label={themeLabel}
              title={themeLabel}
              className="grid size-9 place-items-center rounded-control hover:bg-sunken"
            >
              <Icon name={THEME_ICON[current]} />
            </button>
          </div>

          <nav aria-label="Main" className="flex flex-col gap-1 p-3">
            {!collapsed && <p className="px-3 pb-1 text-sm text-muted">Navigation</p>}
            {PLACES.map((p) => (
              <NavLink
                key={p.to}
                to={p.to}
                end
                title={collapsed ? p.label : undefined}
                className={({ isActive }) => item(isActive)}
              >
                <Icon name={p.icon} />
                <span className={collapsed ? 'sr-only' : ''}>{p.label}</span>
              </NavLink>
            ))}
          </nav>

          <div className="mt-auto p-3">
            <NavLink
              to="/profile"
              title={collapsed ? 'Profile' : undefined}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-full ${collapsed ? 'justify-center' : 'bg-sunken p-2 pr-4'} ${
                  isActive ? 'ring-1 ring-thread' : 'hover:ring-1 hover:ring-edge'
                }`
              }
            >
              <span
                aria-hidden="true"
                className="grid size-10 flex-none place-items-center rounded-full bg-thread text-md font-semibold text-on-thread"
              >
                {name.charAt(0).toUpperCase()}
              </span>
              <span className={collapsed ? 'sr-only' : 'min-w-0 leading-tight'}>
                <span className="block truncate font-semibold">{name}</span>
                <span className="block text-sm text-muted">Profile &amp; settings</span>
              </span>
            </NavLink>
          </div>
        </div>
      </aside>

      <main id="main" className="page relative min-w-0 bg-surface pb-16 md:pb-0">
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="absolute top-4 left-2 z-10 hidden size-9 place-items-center rounded-control text-muted hover:bg-sunken hover:text-ink md:grid"
        >
          <Icon name="panel" />
        </button>
        <Outlet />
      </main>

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 grid grid-cols-4 border-t border-line bg-paper md:hidden"
      >
        {[...PLACES, { to: '/profile', label: 'Profile', icon: 'user' as IconName }].map((p) => (
          <NavLink
            key={p.to}
            to={p.to}
            end
            className={({ isActive }) =>
              `flex min-h-14 flex-col items-center justify-center gap-1 text-xs ${
                isActive ? 'font-semibold text-thread' : 'text-muted'
              }`
            }
          >
            <Icon name={p.icon} />
            {p.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
