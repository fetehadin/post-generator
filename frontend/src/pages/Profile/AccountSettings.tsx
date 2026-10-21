import { useState } from 'react'
import { Link } from 'react-router'
import { downloadExport, useDeleteAccount, useUsage } from '../../api/account'
import { supabase } from '../../lib/auth'

const time = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' })
const button = 'inline-flex min-h-10 items-center rounded-control border border-edge px-4 text-sm'

/** Profile → Settings: today's usage (FR-30), export and delete (FR-38), status, log out. */
export function AccountSettings() {
  const usage = useUsage()
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')

  async function exportNow() {
    setExporting(true)
    setExportError('')
    try {
      await downloadExport()
    } catch (e) {
      setExportError(e instanceof Error ? e.message : 'The export failed.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="mt-3 flex flex-col gap-6">
      {usage.data && (
        <p className="text-sm">
          Today: <b className="tabular-nums">{usage.data.drafts}</b> of {usage.data.draft_limit}{' '}
          drafts and revisions, <b className="tabular-nums">{usage.data.posts}</b> of{' '}
          {usage.data.post_limit} posts learned.{' '}
          <span className="text-muted">
            Resets at {time.format(new Date(usage.data.resets_at))}.
          </span>
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void exportNow()}
          disabled={exporting}
          className={button}
        >
          {exporting ? 'Preparing…' : 'Export my data'}
        </button>
        <Link to="/status" className={button}>
          System status
        </Link>
        {supabase && (
          <button type="button" onClick={() => supabase?.auth.signOut()} className={button}>
            Log out
          </button>
        )}
      </div>
      {exportError && (
        <p role="alert" className="text-sm text-danger">
          {exportError}
        </p>
      )}

      <DeleteAccount />
    </div>
  )
}

function DeleteAccount() {
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const remove = useDeleteAccount()

  if (remove.isSuccess)
    return (
      <p role="status" className="text-sm">
        Everything is deleted. You can close this page.
      </p>
    )

  return (
    <section aria-labelledby="delete" className="rounded-panel border border-line p-4">
      <h3 id="delete" className="font-semibold text-danger">
        Delete all my data
      </h3>
      <p className="mt-1 text-sm text-muted">
        Removes your imported posts and what Voxlace learned from them, your profile and cards,
        check-ins, drafts and their history. This can't be undone. Export first if you want a copy.
      </p>
      {open ? (
        <form
          className="mt-3 flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            remove.mutate(typed, { onSuccess: () => void supabase?.auth.signOut() })
          }}
        >
          <label className="text-sm">
            Type <b>delete</b> to confirm
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              className="mt-1 block min-h-10 rounded-control border border-edge bg-surface px-3"
            />
          </label>
          <button
            type="submit"
            disabled={typed.trim().toLowerCase() !== 'delete' || remove.isPending}
            className="inline-flex min-h-10 items-center rounded-control bg-danger px-4 text-sm font-semibold text-on-thread disabled:cursor-not-allowed disabled:bg-sunken disabled:text-muted"
          >
            {remove.isPending ? 'Deleting…' : 'Delete everything'}
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="min-h-10 px-3 text-sm text-muted"
          >
            Cancel
          </button>
        </form>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className={`${button} mt-3`}>
          Delete all my data…
        </button>
      )}
      {remove.isError && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {remove.error.message}
        </p>
      )}
    </section>
  )
}
