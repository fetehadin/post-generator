import { Link } from 'react-router'
import { useMe } from '../../api/me'
import { supabase } from '../../lib/auth'

/**
 * Profile (DESIGN.md §2, decided 21 Oct 2026): everything about you, editable, plus settings.
 * Phase 3 fills "About you" and "Your posts and voice"; settings grow in Phases 5–6.
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
        <p className="mt-2 text-sm text-muted">
          Your work, interests, audience and language, and the short summary Voxlace writes from
          them. Coming next in Phase 3.
        </p>
      </section>

      <section aria-labelledby="posts" className="mt-10">
        <h2 id="posts" className="text-lg font-semibold">
          Your posts and voice
        </h2>
        <p className="mt-2 text-sm text-muted">
          Your previous posts per platform, with pin and exclude, and your voice card. Coming next
          in Phase 3.
        </p>
        <Link
          to="/import"
          className="mt-3 inline-flex min-h-10 items-center rounded-control border border-edge px-4 text-sm"
        >
          Import posts
        </Link>
      </section>

      <section aria-labelledby="settings" className="mt-10 border-t border-line pt-8">
        <h2 id="settings" className="text-lg font-semibold">
          Settings
        </h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            to="/status"
            className="inline-flex min-h-10 items-center rounded-control border border-edge px-4 text-sm"
          >
            System status
          </Link>
          {supabase && (
            <button
              type="button"
              onClick={() => supabase?.auth.signOut()}
              className="inline-flex min-h-10 items-center rounded-control border border-edge px-4 text-sm"
            >
              Log out
            </button>
          )}
        </div>
      </section>
    </div>
  )
}
