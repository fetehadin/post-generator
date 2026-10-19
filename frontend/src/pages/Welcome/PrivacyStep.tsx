import { useAcceptPrivacy } from '../../api/me'

/** FR-37: a short privacy notice before any upload. Plain words, no legalese. */
export function PrivacyStep() {
  const accept = useAcceptPrivacy()
  return (
    <main className="mx-auto max-w-[640px] px-4 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Before you upload</h1>
      <p className="mt-2 text-muted">How Voxlace handles your posts, in short:</p>
      <ul className="mt-6 list-disc space-y-3 pl-5">
        <li>
          <b>We keep the text of your own posts</b> and the drafts you make, so Voxlace can write in
          your voice. Nobody else can see them.
        </li>
        <li>
          <b>Your export file is read once and deleted.</b> We skip reposts, forwards and other
          people's messages.
        </li>
        <li>
          <b>Google's Gemini AI processes your posts</b> to learn your voice and write drafts. We
          never train an AI model on them.
        </li>
        <li>
          <b>We never ask for your social media passwords</b> and never post anything without your
          approval.
        </li>
        <li>
          <b>You can delete everything at any time.</b> Export and deletion arrive in Settings
          before the beta.
        </li>
      </ul>
      {accept.isError && (
        <p role="alert" className="mt-6 text-sm text-danger">
          {accept.error.message}
        </p>
      )}
      <button
        type="button"
        onClick={() => accept.mutate()}
        disabled={accept.isPending}
        className="mt-8 min-h-10 rounded-control bg-thread px-4 text-sm font-semibold text-on-thread disabled:bg-sunken disabled:text-muted"
      >
        I understand, continue
      </button>
    </main>
  )
}
