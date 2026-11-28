import { useEffect } from 'react'
import { Link, useLocation } from 'react-router'
import { dismissDone, useDoneNotice } from '../lib/doneAlert'
import { primary } from '../lib/ui'
import { Icon } from './Icon'

/**
 * "Your drafts are ready" when they finish while you're on another page (lib/doneAlert).
 * Bottom right on a computer, above the tab bar on a phone. Opening that chat clears it.
 */
export function DoneNotice() {
  const notice = useDoneNotice()
  const { pathname } = useLocation()
  useEffect(() => {
    if (notice && pathname === `/chat/${notice.threadId}`) dismissDone()
  }, [notice, pathname])

  return (
    // Always in the page, so screen readers hear it when the text arrives (WCAG 4.1.3).
    <div role="status" className="fixed right-4 bottom-20 z-40 md:bottom-6">
      {notice && (
        <div className="flex items-center gap-3 rounded-panel border border-line bg-composer py-2 pr-2 pl-4 text-sm shadow-float">
          <Icon name="check" className="size-4 text-thread" />
          <span>
            {notice.count === 1 ? 'Your draft is ready' : `Your ${notice.count} drafts are ready`}
          </span>
          <Link to={`/chat/${notice.threadId}`} className={primary}>
            Open
          </Link>
          <button
            type="button"
            onClick={dismissDone}
            aria-label="Dismiss"
            className="grid size-9 place-items-center rounded-full text-muted hover:bg-sunken hover:text-ink"
          >
            <Icon name="x" className="size-4" />
          </button>
        </div>
      )}
    </div>
  )
}
