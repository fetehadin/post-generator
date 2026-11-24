import { useProfileStrength } from '../api/me'

/**
 * A thin progress ring around the avatar (FR-53): how complete the profile is. Gone at 100%,
 * so it nags only while there is something worth adding.
 */
export function StrengthRing({ children }: { children: React.ReactNode }) {
  const strength = useProfileStrength()
  const percent = strength.data?.percent
  if (percent === undefined || percent >= 100) return <>{children}</>
  const r = 18
  const c = 2 * Math.PI * r
  return (
    <span className="relative grid size-10 flex-none place-items-center">
      <svg viewBox="0 0 40 40" className="absolute inset-0 -rotate-90" aria-hidden="true">
        <circle cx="20" cy="20" r={r} fill="none" strokeWidth="2.5" className="stroke-line" />
        <circle
          cx="20"
          cy="20"
          r={r}
          fill="none"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={`${(c * percent) / 100} ${c}`}
          className="stroke-primary"
        />
      </svg>
      {children}
      <span className="sr-only">Profile {percent}% complete</span>
    </span>
  )
}
