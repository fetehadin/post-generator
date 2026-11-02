import { Navigate, useParams } from 'react-router'
import { useDraft } from '../../api/drafts'
import { EditorPage } from '../Editor/EditorPage'

/**
 * /drafts/:id keeps every draft's link working (DESIGN.md §2): it opens the draft's chat with
 * its card in focus. A draft from before threads has none, so it keeps the editor.
 */
export function DraftRedirect() {
  const { id = '' } = useParams()
  const draft = useDraft(id)
  if (draft.isPending) return <p className="mx-auto max-w-column px-4 py-16 text-muted">Loading…</p>
  if (draft.data?.thread_id)
    return <Navigate to={`/chat/${draft.data.thread_id}`} state={{ draft: id }} replace />
  return <EditorPage />
}
