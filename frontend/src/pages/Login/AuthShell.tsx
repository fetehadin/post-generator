import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { Wordmark } from '../../components/Logo'
import { LegalLinks } from '../Legal/LegalLayout'

/**
 * The frame for log in, sign-up, reset and "check your email" (FR-27): one centred column,
 * 400px wide because that is the widest Google draws its sign-in button, so the button, the
 * fields and the main button all line up. The wordmark leads home; Privacy · Terms sit at the
 * foot of every one of these pages.
 */
export function AuthShell({
  title,
  lead,
  children,
}: {
  title: string
  lead?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-paper px-4">
      <main className="mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center py-12">
        <Link
          to="/"
          aria-label="Voxlace home"
          className="mx-auto inline-flex min-h-11 items-center rounded-full px-2"
        >
          <Wordmark className="h-7 w-auto text-ink" />
        </Link>
        <h1 className="mt-8 text-center text-2xl font-semibold tracking-tight">{title}</h1>
        {lead && <p className="mt-2 text-center text-sm text-muted">{lead}</p>}
        <div className="mt-8">{children}</div>
      </main>
      <footer className="pb-6">
        <LegalLinks className="text-center" />
      </footer>
    </div>
  )
}

/** Input and button sizes shared by the auth forms: a little taller than the app's fields. */
export const authField =
  'block min-h-11 w-full rounded-control border border-edge bg-surface px-3 text-md placeholder:text-muted'
export const authPrimary =
  'inline-flex min-h-11 w-full items-center justify-center rounded-full bg-primary px-4 text-sm font-semibold text-on-primary transition-opacity duration-(--duration) ease-(--ease) hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40'
export const textLink = 'text-thread underline underline-offset-4 hover:no-underline'
