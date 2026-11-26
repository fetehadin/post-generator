import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { PrivacyPage } from './pages/Legal/PrivacyPage'
import { TermsPage } from './pages/Legal/TermsPage'

/**
 * Pages written to plain HTML at build time (scripts/prerender.mjs), so a visitor or checker
 * that doesn't run JavaScript (Google's OAuth branding check) still reads the whole text.
 * The browser then starts the app as usual and React replaces this markup.
 */
export const pages = {
  privacy: { title: 'Privacy policy · Voxlace', element: <PrivacyPage /> },
  terms: { title: 'Terms of use · Voxlace', element: <TermsPage /> },
}

export function render(name: keyof typeof pages): string {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[`/${name}`]}>{pages[name].element}</MemoryRouter>,
  )
}
