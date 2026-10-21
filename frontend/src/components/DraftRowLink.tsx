import { Link } from 'react-router'
import type { DraftRow } from '../api/types'
import { LABEL, STATUS_LABEL } from '../lib/platforms'
import { formatWhen } from '../lib/time'
import { PlatformMark } from './PlatformMark'

/** One quiet row: platform, first line, status (DESIGN.md §4.1, §4.4). Opens the editor. */
export function DraftRowLink({ draft }: { draft: DraftRow }) {
  const firstLine = draft.text.split('\n').find((l) => l.trim()) ?? ''
  const when =
    draft.status === 'published' && draft.published_at
      ? `Posted ${formatWhen(draft.published_at)}`
      : draft.scheduled_for
        ? formatWhen(draft.scheduled_for)
        : ''
  return (
    <Link
      to={`/drafts/${draft.id}`}
      className="flex min-h-12 items-center gap-3 border-b border-line px-2 py-2 hover:bg-sunken"
    >
      <PlatformMark platform={draft.platform} />
      <span className="sr-only">{LABEL[draft.platform]}:</span>
      <span className="min-w-0 flex-1 truncate font-serif">{firstLine}</span>
      <span className="flex-none text-right text-sm text-muted">
        {STATUS_LABEL[draft.status]}
        {when && <span className="block text-xs">{when}</span>}
      </span>
    </Link>
  )
}
