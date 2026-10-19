import { useState } from 'react'
import { NavLink, Outlet } from 'react-router'
import { applyTheme, nextTheme, savedTheme, type Theme } from '../lib/theme'

const PLACES = [
  { to: '/', label: 'Today' },
  { to: '/drafts', label: 'Drafts' },
  { to: '/calendar', label: 'Calendar' },
  { to: '/voice', label: 'Voice' },
]

const navClass = ({ isActive }: { isActive: boolean }) =>
  `flex min-h-11 items-center rounded-control px-3 text-md ${
    isActive ? 'bg-thread-soft font-semibold text-ink' : 'text-ink hover:bg-sunken'
  }`

/** DESIGN.md §2: a floating card with navigation only; no right sidebar. */
export function AppShell() {
  const [theme, setTheme] = useState<Theme | null>(savedTheme)

  function switchTheme() {
    const next = nextTheme(theme)
    applyTheme(next)
    setTheme(next)
  }

  return (
    <div className="min-h-screen md:grid md:grid-cols-[264px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-screen p-3 md:block">
        <div className="flex h-full flex-col rounded-panel border border-line bg-paper">
          <div className="p-4 text-xl font-semibold tracking-tight">Voxlace</div>
          <NavLink
            to="/"
            className="mx-3 mb-4 flex min-h-10 items-center rounded-control border border-edge bg-surface px-4 text-sm"
          >
            + New post
          </NavLink>
          <nav aria-label="Main" className="flex flex-col gap-1 px-3">
            {PLACES.map((p) => (
              <NavLink key={p.to} to={p.to} end className={navClass}>
                {p.label}
              </NavLink>
            ))}
          </nav>
          <details className="relative mt-auto p-3">
            <summary className="flex cursor-pointer list-none items-center gap-3 rounded-control p-2 hover:bg-sunken">
              <span
                aria-hidden="true"
                className="grid size-9 place-items-center rounded-full bg-ink font-semibold text-on-ink"
              >
                F
              </span>
              <span className="text-sm font-semibold">Account and settings</span>
            </summary>
            <div className="absolute inset-x-3 bottom-full mb-1 flex flex-col rounded-panel border border-line bg-surface p-1 shadow-float">
              <button
                type="button"
                onClick={switchTheme}
                className="rounded-control px-3 py-2 text-left text-sm hover:bg-sunken"
              >
                Theme: {theme ?? 'system'}
              </button>
              <NavLink to="/status" className="rounded-control px-3 py-2 text-sm hover:bg-sunken">
                System status
              </NavLink>
            </div>
          </details>
        </div>
      </aside>

      <main id="main" className="page min-w-0 bg-surface pb-16 md:pb-0">
        <Outlet />
      </main>

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 grid grid-cols-4 border-t border-line bg-paper md:hidden"
      >
        {PLACES.map((p) => (
          <NavLink
            key={p.to}
            to={p.to}
            end
            className={({ isActive }) =>
              `flex min-h-14 items-center justify-center text-xs ${isActive ? 'font-semibold text-thread' : 'text-muted'}`
            }
          >
            {p.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
