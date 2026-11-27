import { cn } from '@/lib/utils'

/** A small set of line icons drawn for Voxlace (no icon library). 20px, currentColor. */
const PATHS = {
  home: 'M4 11l8-7 8 7v9h-5v-6H9v6H4z',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 1 0 0-14zM20 20l-4-4',
  calendar: 'M4 6h16v15H4zM4 10h16M9 3v4M15 3v4',
  drafts: 'M7 3h8l4 4v14H7zM15 3v4h4M10 12h6M10 16h6',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 1 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  moon: 'M20 14.5A8 8 0 1 1 9.5 4 6.5 6.5 0 0 0 20 14.5z',
  user: 'M12 4a4 4 0 1 0 0 8 4 4 0 1 0 0-8zM4 21c1.5-4 4.5-6 8-6s6.5 2 8 6',
  panel: 'M4 4h16v16H4zM10 4v16',
  collapse: 'M4 4h16v16H4zM9 4v16M15 9l-3 3 3 3',
  expand: 'M4 4h16v16H4zM9 4v16M13 9l3 3-3 3',
  bell: 'M6 16V11a6 6 0 1 1 12 0v5l2 2H4zM10 21h4',
  x: 'M6 6l12 12M18 6L6 18',
  plus: 'M12 5v14M5 12h14',
  chat: 'M4 5h16v11H9l-5 4z',
  'chevron-down': 'M6 10l6 6 6-6',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  'chevron-right': 'M10 6l6 6-6 6',
  dot: 'M12 10.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 1 0 0-3z',
  grip: 'M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01',
  alert: 'M12 3l9.5 17h-19zM12 10v4M12 17h.01',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18zM12 7v5l3 2',
  'arrow-up': 'M12 19V5M6 11l6-6 6 6',
  /** The composer's options. */
  sliders: 'M4 7h10M18 7h2M4 17h4M12 17h8M16 5v4M10 15v4',
  /** Stop waiting for the AI. */
  stop: 'M8 8h8v8H8z',
  undo: 'M9 14l-5-5 5-5M4 9h10a6 6 0 0 1 0 12h-3',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  more: 'M6 12h.01M12 12h.01M18 12h.01',
  pencil: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 1 0 0-6z',
  sparkle:
    'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 15l.7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7z',
  pin: 'M9 3h6l-1 6 4 4H6l4-4zM12 13v8',
  archive: 'M3 4h18v4H3zM5 8v12h14V8M10 12h4',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  refresh: 'M20 11a8 8 0 0 0-14.9-3M4 4v4h4M4 13a8 8 0 0 0 14.9 3M20 20v-4h-4',
  globe:
    'M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18zM3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z',
  /** The AI's one honest mark: a pen nib, not the sparkle cliché. */
  nib: 'M12 3l6 8-6 10-6-10zM12 11v4M12 11a1 1 0 1 0 0 .01',
} as const

export type IconName = keyof typeof PATHS

export function Icon({ name, className = '' }: { name: IconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={cn('size-5 flex-none fill-none stroke-current', className)}
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={PATHS[name]} />
    </svg>
  )
}
