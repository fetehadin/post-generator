import { useState } from 'react'
import { NavLink, Outlet } from 'react-router'
import { applyTheme, nextTheme, savedTheme, type Theme } from '../lib/theme'
import { Icon, type IconName } from './Icon'

const PLACES: Array<{ to: string; label: string; icon: IconName }> = [
  { to: '/', label: 'Home', icon: 'home' },
  { to: '/calendar', label: 'Calendar', icon: 'calendar' },
  { to: '/drafts', label: 'Drafts', icon: 'drafts' },
]

const THEME_ICON: Record<Theme, IconName> = { light: 'sun', dark: 'moon', mixed: 'mixed' }
const COLLAPSED_KEY = 'voxlace-sidebar-collapsed'

function savedCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * DESIGN.md §2 (decided 21 Oct 2026): Home · Calendar · Drafts, then the theme toggle, the
 * collapse button and the avatar → Profile. No right sidebar. Mobile: a bottom tab bar.
 */
export function AppShell() {
  const [theme, setTheme] = useState<Theme | null>(savedTheme)
  const [collapsed, setCollapsed] = useState(savedCollapsed)

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

  const current = theme ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
  const item = (active: boolean) =>
    `flex min-h-11 items-center gap-3 rounded-control ${collapsed ? 'justify-center' : 'px-3'} ${
      active ? 'bg-thread-soft font-semibold text-ink' : 'text-ink hover:bg-sunken'
    }`

  return (
    <div
      className={`min-h-screen md:grid ${
        collapsed ? 'md:grid-cols-[88px_minmax(0,1fr)]' : 'md:grid-cols-[264px_minmax(0,1fr)]'
      }`}
    >
      <aside className="sticky top-0 hidden h-screen p-3 md:block">
        <div className="flex h-full flex-col gap-1 rounded-panel border border-line bg-paper p-3">
          <div
            className={`pb-4 text-xl font-semibold tracking-tight ${collapsed ? 'text-center' : 'px-1 pt-1'}`}
          >
            {collapsed ? 'V' : 'Voxlace'}
          </div>
          <nav aria-label="Main" className="flex flex-col gap-1">
            {PLACES.map((p) => (
              <NavLink
                key={p.to}
                to={p.to}
                end
                title={collapsed ? p.label : undefined}
                className={({ isActive }) => item(isActive)}
              >
                <Icon name={p.icon} className="text-muted" />
                <span className={collapsed ? 'sr-only' : ''}>{p.label}</span>
              </NavLink>
            ))}
          </nav>

          <div className="mt-auto flex flex-col gap-1">
            <button
              type="button"
              onClick={switchTheme}
              className={item(false)}
              title={collapsed ? `Theme: ${current}` : undefined}
            >
              <Icon name={THEME_ICON[current]} className="text-muted" />
              <span className={collapsed ? 'sr-only' : 'text-sm'}>Theme: {current}</span>
            </button>
            <button
              type="button"
              onClick={toggleCollapsed}
              aria-expanded={!collapsed}
              className={item(false)}
              title={collapsed ? 'Expand sidebar' : undefined}
            >
              <Icon name={collapsed ? 'expand' : 'collapse'} className="text-muted" />
              <span className={collapsed ? 'sr-only' : 'text-sm'}>
                {collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              </span>
            </button>
            <NavLink
              to="/profile"
              title={collapsed ? 'Profile' : undefined}
              className={({ isActive }) => item(isActive)}
            >
              <span
                aria-hidden="true"
                className="grid size-8 flex-none place-items-center rounded-full bg-ink text-sm font-semibold text-on-ink"
              >
                F
              </span>
              <span className={collapsed ? 'sr-only' : 'text-sm'}>Profile</span>
            </NavLink>
          </div>
        </div>
      </aside>

      <main id="main" className="page min-w-0 bg-surface pb-16 md:pb-0">
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
