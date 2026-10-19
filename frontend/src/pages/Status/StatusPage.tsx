import { useHealth } from '../../api/health'

function Part({ name, value }: { name: string; value: string | undefined }) {
  const ok = value === 'ok'
  return (
    <li className="flex items-center justify-between gap-4 py-3">
      <span>{name}</span>
      <span className={ok ? 'font-semibold text-thread' : 'font-semibold text-danger'}>
        {value ?? 'unknown'}
      </span>
    </li>
  )
}

/** Phase 0 demo: the browser shows "API: ok, DB: ok". */
export function StatusPage() {
  const health = useHealth()

  return (
    <main className="mx-auto max-w-md px-4 py-16">
      <h1 className="text-xl font-semibold">Voxlace</h1>
      <p className="mt-1 text-muted">System status</p>

      <section aria-live="polite" className="mt-8 rounded-panel border border-line bg-surface px-4">
        {health.isPending && <p className="py-3">Checking…</p>}
        {health.isError && (
          <p role="alert" className="py-3 text-danger">
            {health.error.message}
          </p>
        )}
        {health.isSuccess && (
          <ul className="divide-y divide-line">
            <Part name="API" value={health.data.api} />
            <Part name="Database" value={health.data.db} />
          </ul>
        )}
      </section>
    </main>
  )
}
