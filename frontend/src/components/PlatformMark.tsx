import type { Platform } from '../api/types'

/** Small platform marks, drawn for Voxlace; the name is always given in text too. */
export function PlatformMark({ platform }: { platform: Platform }) {
  const common = 'size-[18px] flex-none'
  if (platform === 'x')
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={common}>
        <path
          d="M4 4l16 16M20 4L4 20"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
      </svg>
    )
  if (platform === 'linkedin')
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={common}>
        <rect x="2.5" y="2.5" width="19" height="19" rx="4" fill="currentColor" />
        <path
          d="M7.5 10.5v6M7.5 7.5v.01M11.5 16.5v-6M11.5 13c0-1.7 1-2.6 2.4-2.6s2.1.9 2.1 2.6v3.5"
          stroke="var(--surface)"
          strokeWidth="1.9"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
    )
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={common}>
      <path
        d="M21 4L3 11l6 2 2 6 3-4 5 4z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinejoin="round"
      />
    </svg>
  )
}
