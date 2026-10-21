import type { Platform } from '../../api/types'
import { LABEL } from '../../lib/platforms'

// Roughly where each platform folds a long post behind "Show more" / "…see more".
const FOLD: Record<Platform, number | null> = { x: 280, linkedin: 210, telegram: null }

/** How the post will look on the platform: its line breaks and its fold (DESIGN.md §4.2). */
export function Preview({
  platform,
  text,
  name,
}: {
  platform: Platform
  text: string
  name: string
}) {
  const fold = FOLD[platform]
  const folded = fold !== null && text.length > fold
  const shown = folded ? text.slice(0, fold).trimEnd() : text
  return (
    <figure
      aria-label={`${LABEL[platform]} preview`}
      className={`rounded-panel border border-line bg-surface p-4 font-sans ${
        platform === 'telegram' ? 'max-w-[480px] rounded-bl-none bg-thread-soft' : ''
      }`}
    >
      {platform !== 'telegram' && (
        <figcaption className="mb-2 flex items-center gap-2 text-sm">
          <span
            aria-hidden="true"
            className="grid size-9 place-items-center rounded-full bg-thread font-semibold text-on-thread"
          >
            {name.charAt(0).toUpperCase()}
          </span>
          <span className="font-semibold">{name}</span>
        </figcaption>
      )}
      <p className="text-md leading-relaxed whitespace-pre-wrap">
        {shown}
        {folded && (
          <span className="text-muted">{platform === 'x' ? '… Show more' : '…see more'}</span>
        )}
      </p>
    </figure>
  )
}
