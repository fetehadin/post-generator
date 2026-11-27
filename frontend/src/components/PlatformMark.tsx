import type { Platform } from '../api/types'
import { cn } from '../lib/utils'

/**
 * Each platform's own logo, in its own colours (DESIGN.md §5), so a post's platform is known at
 * a glance: X's black mark (it follows the text colour, so it turns white in dark mode and on a
 * selected chip), LinkedIn's blue "in" square and Telegram's blue circle with the white plane.
 * The shapes are the brands' published marks. Decorative: the platform's name is always in the
 * text or the label next to it.
 */
export function PlatformMark({ platform, className }: { platform: Platform; className?: string }) {
  const common = cn('size-[18px] flex-none', className)
  if (platform === 'x')
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={common} fill="currentColor">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    )
  if (platform === 'linkedin')
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={common}>
        <rect width="24" height="24" rx="4" className="fill-linkedin" />
        <path
          className="fill-white"
          d="M7.12 20H3.56V9h3.56v11zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zM20.45 20h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94V20H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46V20z"
        />
      </svg>
    )
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={common}>
      <circle cx="12" cy="12" r="12" className="fill-telegram" />
      <path
        className="fill-white"
        d="M5.43 11.87c3.5-1.52 5.83-2.53 7-3.01 3.33-1.39 4.02-1.63 4.47-1.64.1 0 .32.02.47.14.12.1.15.23.17.33.02.09.04.3.02.47-.18 1.9-.96 6.5-1.36 8.63-.17.9-.5 1.2-.82 1.23-.7.06-1.22-.46-1.9-.9-1.05-.7-1.65-1.13-2.68-1.8-1.18-.78-.41-1.21.26-1.91.18-.18 3.25-2.98 3.3-3.23.01-.03.02-.15-.05-.21-.07-.06-.17-.04-.25-.02-.1.02-1.8 1.14-5.06 3.35-.48.33-.91.49-1.3.48-.43-.01-1.25-.24-1.87-.44-.75-.24-1.35-.37-1.3-.79.03-.22.33-.44.9-.66z"
      />
    </svg>
  )
}
