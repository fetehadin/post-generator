import { useState, type DragEvent } from 'react'
import { Link } from 'react-router'
import { useCreateImport, useImport } from '../../api/imports'
import type { ImportJob, SkipReason } from '../../api/types'
import { SKIP_LABELS } from './skipReasons'

const MAX_BYTES = 64 * 1024 * 1024 // the API's limit (docs/API.md)

/** Phase 1: import a Telegram channel export (FR-1, FR-2, FR-3). */
export function UploadPage() {
  const [file, setFile] = useState<File | null>(null)
  const [tooBig, setTooBig] = useState(false)
  const create = useCreateImport()
  const job = useImport(create.data?.id)
  const current = job.data ?? create.data

  function choose(f: File | undefined) {
    if (!f) return
    setFile(f)
    setTooBig(f.size > MAX_BYTES)
    create.reset()
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    choose(e.dataTransfer.files[0])
  }

  if (current) return <Result job={current} />

  return (
    <div className="mx-auto max-w-[720px] px-4 py-12 md:px-6 md:py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Import your posts</h1>
      <p className="mt-2 text-muted">
        Voxlace learns your voice from posts you've already written. Your file is read once and
        never stored.
      </p>

      <section aria-labelledby="howto" className="mt-8">
        <h2 id="howto" className="text-sm font-semibold">
          Export your Telegram channel
        </h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted">
          <li>Open your channel in Telegram Desktop.</li>
          <li>Open the ⋮ menu and choose Export chat history.</li>
          <li>Untick photos and videos, and pick the JSON format.</li>
          <li>Upload the result.json file here.</li>
        </ol>
        <p className="mt-2 text-xs text-muted">X and LinkedIn imports come next.</p>
      </section>

      <form
        className="mt-8"
        onSubmit={(e) => {
          e.preventDefault()
          if (file && !tooBig) create.mutate({ platform: 'telegram', file })
        }}
      >
        <label
          htmlFor="export-file"
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
          className="flex cursor-pointer flex-col items-center gap-1 rounded-panel border border-dashed border-edge bg-paper px-6 py-10 text-center"
        >
          <span className="font-semibold">{file ? file.name : 'Choose result.json'}</span>
          <span className="text-sm text-muted">
            {file ? 'Choose another file' : 'or drop it here'}
          </span>
        </label>
        <input
          id="export-file"
          type="file"
          accept=".json,application/json"
          className="sr-only"
          onChange={(e) => choose(e.target.files?.[0])}
        />

        {tooBig && (
          <p role="alert" className="mt-3 text-sm text-danger">
            This file is larger than 64 MB. Export one channel only, without photos and videos.
          </p>
        )}
        {create.isError && (
          <p role="alert" className="mt-3 text-sm text-danger">
            {create.error.message}
          </p>
        )}

        <button
          type="submit"
          disabled={!file || tooBig || create.isPending}
          className="mt-6 inline-flex min-h-10 items-center rounded-control bg-thread px-4 text-sm font-semibold text-on-thread disabled:cursor-not-allowed disabled:bg-sunken disabled:text-muted"
        >
          {create.isPending ? 'Reading your posts…' : 'Import posts'}
        </button>
      </form>
    </div>
  )
}

function Result({ job }: { job: ImportJob }) {
  // "Already imported" isn't a skip: those posts are kept, just not added twice (FR-2).
  const { already_imported: already = 0, ...rest } = job.skipped
  const skipped = (Object.entries(rest) as Array<[SkipReason, number]>).sort((a, b) => b[1] - a[1])
  const totalSkipped = skipped.reduce((n, [, c]) => n + c, 0)
  const done = job.status === 'done'

  return (
    <div className="mx-auto max-w-[720px] px-4 py-12 md:px-6 md:py-16">
      <h1 className="text-2xl font-semibold tracking-tight">
        {job.parsed.toLocaleString('en')} posts found
      </h1>
      {already > 0 && (
        <p className="mt-2 text-sm text-muted">
          {already === job.parsed ? 'All of them were' : `${already.toLocaleString('en')} were`}{' '}
          already imported, so nothing was added twice.
        </p>
      )}
      {totalSkipped > 0 && (
        <details className="mt-2 text-sm text-muted">
          <summary className="cursor-pointer">
            {totalSkipped.toLocaleString('en')} messages skipped
          </summary>
          <ul className="mt-2 space-y-1 pl-4">
            {skipped.map(([reason, count]) => (
              <li key={reason}>
                {count.toLocaleString('en')} {SKIP_LABELS[reason]}
              </li>
            ))}
          </ul>
        </details>
      )}

      <section aria-live="polite" className="mt-8">
        {done ? (
          <>
            <p className="font-semibold">Your voice is ready.</p>
            <Link
              to="/"
              className="mt-4 inline-flex min-h-10 items-center rounded-control bg-thread px-4 text-sm font-semibold text-on-thread"
            >
              Write your first post
            </Link>
          </>
        ) : (
          <>
            <label htmlFor="learning" className="text-sm">
              Learning your voice… {job.embedded.toLocaleString('en')} of{' '}
              {job.parsed.toLocaleString('en')}
            </label>
            <progress
              id="learning"
              max={Math.max(job.parsed, 1)}
              value={job.embedded}
              className="mt-2 block h-2 w-full overflow-hidden rounded-full [&::-moz-progress-bar]:bg-thread [&::-webkit-progress-bar]:bg-sunken [&::-webkit-progress-value]:bg-thread"
            />
            <p className="mt-2 text-xs text-muted">
              About 100 posts a minute. You can leave this page; it keeps going.
            </p>
          </>
        )}
      </section>
    </div>
  )
}
