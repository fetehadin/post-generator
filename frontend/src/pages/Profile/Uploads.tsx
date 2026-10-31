import { useState } from 'react'
import {
  type Upload,
  useAddPortfolio,
  useDeleteUpload,
  useEditUpload,
  useUploadResume,
  useUploads,
} from '../../api/uploads'

const input =
  'mt-1 block min-h-10 w-full rounded-control border border-edge bg-surface px-3 text-sm'
const button =
  'inline-flex min-h-10 items-center rounded-control border border-edge px-4 text-sm disabled:text-muted'

/** "Removed 1 email and 2 phone numbers", so the user sees what was taken out (FR-21). */
export function removedNote(removed: Upload['removed']): string {
  const parts = (
    [
      ['emails', 'email', 'emails'],
      ['phones', 'phone number', 'phone numbers'],
      ['addresses', 'address line', 'address lines'],
    ] as const
  )
    .filter(([key]) => removed[key])
    .map(([key, one, many]) => `${removed[key]} ${removed[key] === 1 ? one : many}`)
  if (!parts.length) return 'No contact details found.'
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts[0]
  return `Removed ${list}.`
}

/**
 * Profile → Resume and portfolio (FR-20, FR-21): text only, contacts removed on the server,
 * and nothing reaches the summary card until the user reads it and says so.
 */
export function Uploads() {
  const uploads = useUploads()
  const resume = useUploadResume()
  const portfolio = useAddPortfolio()
  const [url, setUrl] = useState('')
  const [takenOut, setTakenOut] = useState(false)
  const error = resume.error ?? portfolio.error

  return (
    <div className="mt-4 flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm">
          Resume (PDF or Word)
          <input
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            disabled={resume.isPending}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) {
                portfolio.reset()
                resume.mutate(file)
              }
              e.target.value = ''
            }}
            className="mt-1 block w-full text-sm"
          />
        </label>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (!url.trim()) return
            resume.reset()
            portfolio.mutate(url.trim(), { onSuccess: () => setUrl('') })
          }}
          className="text-sm"
        >
          <label htmlFor="portfolio-url">Portfolio page</label>
          <div className="mt-1 flex gap-2">
            <input
              id="portfolio-url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://you.dev"
              className={`${input} mt-0`}
            />
            <button type="submit" disabled={portfolio.isPending || !url.trim()} className={button}>
              {portfolio.isPending ? 'Reading…' : 'Read page'}
            </button>
          </div>
        </form>
      </div>
      <p className="text-sm text-muted">
        {resume.isPending
          ? 'Reading your resume…'
          : 'Emails, phone numbers and addresses are removed before anything is saved. The file isn’t kept.'}
      </p>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error.message}
        </p>
      )}

      {takenOut && (
        <p role="status" className="text-sm text-muted">
          Your summary card may still mention it. Rewrite the card under About you to take it out.
        </p>
      )}

      {uploads.data?.map((u) => (
        <UploadCard
          key={`${u.id}-${u.updated_at}`}
          upload={u}
          onTakenOut={() => setTakenOut(true)}
        />
      ))}
    </div>
  )
}

function UploadCard({ upload, onTakenOut }: { upload: Upload; onTakenOut: () => void }) {
  const [text, setText] = useState(upload.text)
  const edit = useEditUpload()
  const remove = useDeleteUpload()
  const busy = edit.isPending || remove.isPending
  const changed = text !== upload.text
  const label = upload.kind === 'resume' ? 'Resume' : 'Portfolio'

  return (
    <section
      aria-label={`${label}: ${upload.source}`}
      className="rounded-panel border border-line bg-paper p-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold">
          {label} <span className="font-normal text-muted">· {upload.source}</span>
        </h3>
        <span className="text-sm text-muted">
          {upload.reviewed
            ? 'Used when you write your summary card'
            : 'Not used until you check it'}
        </span>
      </div>
      <p className="mt-1 text-sm text-muted">{removedNote(upload.removed)}</p>
      <label htmlFor={`upload-${upload.id}`} className="sr-only">
        {label} text
      </label>
      <textarea
        id={`upload-${upload.id}`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="mt-3 block max-h-96 min-h-32 w-full resize-y rounded-control border border-edge bg-surface p-3 font-serif text-sm leading-[1.6]"
      />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {changed && (
          <button
            type="button"
            disabled={busy}
            onClick={() => edit.mutate({ id: upload.id, text })}
            className={button}
          >
            Save text
          </button>
        )}
        <button
          type="button"
          disabled={busy || changed}
          onClick={() =>
            edit.mutate(
              { id: upload.id, reviewed: !upload.reviewed },
              { onSuccess: (u) => !u.reviewed && onTakenOut() },
            )
          }
          className={
            upload.reviewed
              ? button
              : 'inline-flex min-h-10 items-center rounded-control bg-thread px-4 text-sm font-semibold text-on-thread disabled:cursor-not-allowed disabled:bg-sunken disabled:text-muted'
          }
        >
          {upload.reviewed ? 'Stop using it' : 'I checked it: use in my summary card'}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => remove.mutate(upload.id, { onSuccess: onTakenOut })}
          className="text-sm text-muted underline"
        >
          Delete
        </button>
        {(edit.error ?? remove.error) && (
          <p role="alert" className="text-sm text-danger">
            {(edit.error ?? remove.error)?.message}
          </p>
        )}
      </div>
    </section>
  )
}
