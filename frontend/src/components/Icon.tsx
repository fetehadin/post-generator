/** A small set of line icons drawn for Voxlace (no icon library). 20px, currentColor. */
const PATHS = {
  home: 'M4 11l8-7 8 7v9h-5v-6H9v6H4z',
  calendar: 'M4 6h16v15H4zM4 10h16M9 3v4M15 3v4',
  drafts: 'M7 3h8l4 4v14H7zM15 3v4h4M10 12h6M10 16h6',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 1 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  moon: 'M20 14.5A8 8 0 1 1 9.5 4 6.5 6.5 0 0 0 20 14.5z',
  mixed: 'M12 4a8 8 0 1 0 0 16 8 8 0 1 0 0-16zM12 4v16',
  user: 'M12 4a4 4 0 1 0 0 8 4 4 0 1 0 0-8zM4 21c1.5-4 4.5-6 8-6s6.5 2 8 6',
  panel: 'M4 4h16v16H4zM10 4v16',
  collapse: 'M4 4h16v16H4zM9 4v16M15 9l-3 3 3 3',
  expand: 'M4 4h16v16H4zM9 4v16M13 9l3 3-3 3',
} as const

export type IconName = keyof typeof PATHS

export function Icon({ name, className = '' }: { name: IconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={`size-5 flex-none fill-none stroke-current ${className}`}
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={PATHS[name]} />
    </svg>
  )
}
