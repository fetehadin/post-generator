import { Link } from 'react-router'
import { useProfileStrength } from '../../api/me'

/**
 * Top of Profile (FR-53): "Profile strength 65%", a bar and the next thing to add, with how
 * much it adds. Items that make drafts better weigh more. Hidden once the profile is complete.
 */
export function StrengthCard() {
  const strength = useProfileStrength()
  if (!strength.data || strength.data.percent >= 100) return null
  const { percent, items } = strength.data
  const todo = items.filter((i) => !i.done)
  const [next, ...rest] = todo
  const to = (tab: string, section: string) =>
    `/profile?${new URLSearchParams(tab === 'about' ? { section } : { tab, section })}`

  return (
    <section
      aria-labelledby="strength-title"
      className="mt-6 rounded-panel border border-line bg-paper p-4"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="strength-title" className="text-sm font-semibold">
          Profile strength
        </h2>
        <span className="text-2xl font-semibold tabular-nums">{percent}%</span>
      </div>
      <div
        role="progressbar"
        aria-labelledby="strength-title"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="mt-2 h-2 overflow-hidden rounded-full bg-sunken"
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-(--duration)"
          style={{ width: `${percent}%` }}
        />
      </div>
      {next && (
        <p className="mt-3 text-sm">
          <span className="text-muted">Next: </span>
          <Link
            to={to(next.tab, next.section)}
            className="text-thread underline underline-offset-4"
          >
            {next.label}
          </Link>{' '}
          <span className="text-muted">(+{next.weight}%)</span>
        </p>
      )}
      {rest.length > 0 && (
        <details className="mt-2 text-sm">
          <summary className="min-h-10 cursor-pointer content-center text-muted">
            {rest.length} more to complete your profile
          </summary>
          <ul className="mt-1 flex flex-col gap-1">
            {rest.map((i) => (
              <li key={i.id}>
                <Link to={to(i.tab, i.section)} className="underline underline-offset-4">
                  {i.label}
                </Link>{' '}
                <span className="text-muted">(+{i.weight}%)</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}
