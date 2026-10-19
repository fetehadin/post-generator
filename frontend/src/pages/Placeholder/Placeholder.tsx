import { Link } from 'react-router'

/** Screens whose contents are still being decided (docs/SCREEN_FEATURES.md). */
export function Placeholder({ title, when }: { title: string; when: string }) {
  return (
    <div className="mx-auto max-w-[720px] px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 text-muted">This screen arrives in {when}.</p>
      <Link to="/import" className="mt-6 inline-flex text-thread underline underline-offset-4">
        Import your posts
      </Link>
    </div>
  )
}
