import { useState } from 'react'
import { useRedeemInvite } from '../../api/me'
import { supabase } from '../../lib/auth'

/** FR-28: Voxlace is invite-only. */
export function InviteStep({ email }: { email: string }) {
  const [code, setCode] = useState('')
  const redeem = useRedeemInvite()
  return (
    <main className="mx-auto max-w-md px-4 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Enter your invite code</h1>
      <p className="mt-2 text-muted">
        Voxlace is invite-only for now. Your code came with your invitation.
      </p>
      <form
        className="mt-8 flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (code.trim()) redeem.mutate(code)
        }}
      >
        <label htmlFor="invite" className="text-sm font-semibold">
          Invite code
        </label>
        <input
          id="invite"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          autoComplete="one-time-code"
          placeholder="VX-XXXXXX-XXXXXX"
          className="min-h-10 rounded-control border border-edge bg-surface px-3 uppercase"
        />
        {redeem.isError && (
          <p role="alert" className="text-sm text-danger">
            {redeem.error.message}
          </p>
        )}
        <button
          type="submit"
          disabled={!code.trim() || redeem.isPending}
          className="min-h-10 rounded-control bg-thread px-4 text-sm font-semibold text-on-thread disabled:bg-sunken disabled:text-muted"
        >
          {redeem.isPending ? 'Checking…' : 'Join Voxlace'}
        </button>
      </form>
      <p className="mt-6 text-sm text-muted">
        Logged in as {email}.{' '}
        {supabase && (
          <button
            type="button"
            onClick={() => supabase?.auth.signOut()}
            className="underline underline-offset-4"
          >
            Log out
          </button>
        )}
      </p>
    </main>
  )
}
