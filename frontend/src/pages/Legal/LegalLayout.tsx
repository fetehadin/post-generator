import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { Wordmark } from '../../components/Logo'

/** Where people reach us about privacy, terms or their account. Shown on both legal pages. */
export const CONTACT_EMAIL = 'voxlacesupport@gmail.com'

/** The day these pages last changed. Bump it whenever a word of either page changes. */
export const LEGAL_UPDATED = '26 November 2026'

/**
 * The public /privacy and /terms pages (FR-37). No login: Google's consent screen and anyone
 * deciding whether to sign up must be able to read them.
 */
export function LegalLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-line bg-paper px-4 py-3 md:px-6">
        <Link to="/" aria-label="Voxlace home" className="inline-flex min-h-11 items-center">
          <Wordmark className="h-5 w-auto text-ink" />
        </Link>
        <nav aria-label="Legal" className="flex items-center gap-4 text-sm">
          <Link
            to="/privacy"
            className="inline-flex min-h-11 items-center text-muted hover:text-ink"
          >
            Privacy
          </Link>
          <Link to="/terms" className="inline-flex min-h-11 items-center text-muted hover:text-ink">
            Terms
          </Link>
        </nav>
      </header>
      <main className="mx-auto max-w-[680px] px-4 py-12">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-muted">Last updated {LEGAL_UPDATED}</p>
        <div className="mt-8 space-y-4 leading-relaxed [&_h2]:mt-10 [&_h2]:text-lg [&_h2]:font-semibold [&_li]:mt-2 [&_ul]:list-disc [&_ul]:pl-5">
          {children}
        </div>
        <p className="mt-12 border-t border-line pt-6 text-sm text-muted">
          Questions? Email{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-thread underline underline-offset-4">
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </main>
    </div>
  )
}

/** Small "Privacy · Terms" links for the bottom of public pages. */
export function LegalLinks({ className = '' }: { className?: string }) {
  return (
    <p className={`text-sm text-muted ${className}`}>
      <Link to="/privacy" className="underline underline-offset-4 hover:text-ink">
        Privacy
      </Link>
      {' · '}
      <Link to="/terms" className="underline underline-offset-4 hover:text-ink">
        Terms
      </Link>
    </p>
  )
}
