import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { StaticHome } from './pages/Guest/HomeStatic'
import { PrivacyPage } from './pages/Legal/PrivacyPage'
import { TermsPage } from './pages/Legal/TermsPage'

/**
 * Pages written to plain HTML at build time (scripts/prerender.mjs), so a visitor or checker
 * that doesn't run JavaScript (Google's OAuth branding check) still reads the whole text.
 * The browser then starts the app as usual and React replaces this markup. `home` is the
 * logged-out homepage and goes to dist/index.html itself (Caddy serves it for /).
 */
export const pages = {
  home: { title: 'Voxlace', path: '/', element: <StaticHome /> },
  privacy: { title: 'Privacy policy · Voxlace', path: '/privacy', element: <PrivacyPage /> },
  terms: { title: 'Terms of use · Voxlace', path: '/terms', element: <TermsPage /> },
}

export function render(name: keyof typeof pages): string {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[pages[name].path]}>{pages[name].element}</MemoryRouter>,
  )
}
