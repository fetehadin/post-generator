/**
 * Light ⇄ dark (DESIGN.md §5 v4). Saved per browser; the system preference is the default.
 * A saved value from an older version ("mixed") is ignored, so the system preference wins.
 */
export const THEMES = ['light', 'dark'] as const
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

/** The browser bar matches the page (--paper): white in light, near-black in dark. */
const BAR: Record<Theme, string> = { light: '#ffffff', dark: '#171717' }

export function applyTheme(theme: Theme | null) {
  if (theme) document.documentElement.dataset.theme = theme
  else delete document.documentElement.dataset.theme
  // A chosen theme overrides the system one: point both theme-color tags at it.
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    const media = meta.getAttribute('media') ?? ''
    meta.content = theme ? BAR[theme] : media.includes('dark') ? BAR.dark : BAR.light
  }
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
