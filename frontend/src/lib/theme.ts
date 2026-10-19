/** Light → dark → mixed (DESIGN.md §5). Saved per browser; the system preference is the default. */
export const THEMES = ['light', 'dark', 'mixed'] as const
export type Theme = (typeof THEMES)[number]

const KEY = 'voxlace-theme'

export function savedTheme(): Theme | null {
  try {
    const t = localStorage.getItem(KEY)
    return THEMES.includes(t as Theme) ? (t as Theme) : null
  } catch {
    return null
  }
}

export function applyTheme(theme: Theme | null) {
  if (theme) document.documentElement.dataset.theme = theme
  else delete document.documentElement.dataset.theme
}

export function nextTheme(current: Theme | null): Theme {
  const systemDark = matchMedia('(prefers-color-scheme: dark)').matches
  const from = current ?? (systemDark ? 'dark' : 'light')
  const next = THEMES[(THEMES.indexOf(from) + 1) % THEMES.length]
  try {
    localStorage.setItem(KEY, next)
  } catch {
    // Private mode: the choice lasts for this page only.
  }
  return next
}
