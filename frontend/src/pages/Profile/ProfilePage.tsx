import { Link } from 'react-router'
import { useMe } from '../../api/me'
import { AboutYou } from './AboutYou'
import { AccountSettings } from './AccountSettings'
import { YourPosts } from './YourPosts'

/**
 * Profile (DESIGN.md §2, decided 21 Oct 2026): everything about you, editable, plus settings.
 * About you and Your posts are Phase 3; settings grow in Phases 5–6.
 */
export function ProfilePage() {
  const me = useMe()
  return (
    <div className="mx-auto max-w-[720px] px-4 py-12 md:px-6 md:py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
      {me.data && <p className="mt-1 text-muted">{me.data.email}</p>}

      <section aria-labelledby="about" className="mt-10">
        <h2 id="about" className="text-lg font-semibold">
          About you
        </h2>
        <p className="mt-1 text-sm text-muted">
          What Voxlace knows about you. Drafts use the summary card, never guesses.
        </p>
        <AboutYou />
      </section>

      <section aria-labelledby="posts" className="mt-10">
        <div className="flex items-center justify-between gap-3">
          <h2 id="posts" className="text-lg font-semibold">
            Your posts and voice
          </h2>
          <Link
            to="/import"
            className="inline-flex min-h-10 items-center rounded-control border border-edge px-4 text-sm"
          >
            Import posts
          </Link>
        </div>
        <div className="mt-4">
          <YourPosts />
        </div>
      </section>

      <section aria-labelledby="settings" className="mt-10 border-t border-line pt-8">
        <h2 id="settings" className="text-lg font-semibold">
          Settings
        </h2>
        <AccountSettings />
      </section>
    </div>
  )
}
