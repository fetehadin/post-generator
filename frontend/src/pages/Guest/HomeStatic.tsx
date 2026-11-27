import { Link } from 'react-router'
import { Wordmark } from '../../components/Logo'
import { ghost, primary } from '../../lib/ui'
import { LegalLinks } from '../Legal/LegalLayout'
import { HomeSections } from './HomeSections'

/** The homepage's top bar: the wordmark, Log in and Start free (sign-up). */
export function HomeHeader() {
  return (
    <header className="flex items-center justify-between border-b border-line bg-paper px-4 py-3 md:px-6">
      <Wordmark className="h-5 w-auto text-ink" />
      <nav className="flex items-center gap-1 text-sm">
        <Link to="/login" className={ghost}>
          Log in
        </Link>
        <Link to="/login" state={{ mode: 'signup' }} className={primary}>
          Start free
        </Link>
      </nav>
    </header>
  )
}

/**
 * What Voxlace is, in plain words. The name is in the text, not only in the logo: Google's
 * OAuth branding check reads the page's visible text and wants the app's name there.
 */
export function HomeIntro() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight text-balance">
        Posts for X, LinkedIn and Telegram, written in your own voice.
      </h1>
      <p className="mt-3 text-muted">
        Voxlace learns how you write from your own posts and drafts new ones for you. Say what you
        did today. Get a draft for each platform, edit it, and post it when you approve.
      </p>
    </>
  )
}

/**
 * The homepage without JavaScript (src/prerender.tsx → dist/index.html): the parts that don't
 * need the app. In the browser React replaces it with the full GuestPage, or with the app for
 * someone logged in (index.html empties it first then, so it never flashes).
 */
export function StaticHome() {
  return (
    <div className="min-h-screen" data-prerendered="home">
      <HomeHeader />
      <main className="mx-auto max-w-column px-4 pt-10 pb-6 md:px-6 md:pt-16">
        <HomeIntro />
        <HomeSections />
        <LegalLinks className="mt-12 border-t border-line pt-6" />
      </main>
    </div>
  )
}
