/**
 * A fake backend for building screens before (or without) the API: VITE_USE_MOCKS=true.
 * Shapes match docs/API.md. Imports "learn" 120 posts per poll, so progress is visible.
 */
import type { Draft, ImportJob } from '../types'

const imports = new Map<string, ImportJob>()
// Mock users start fully set up; set admitted/privacy_accepted to false to try those steps.
let me = { id: 'mock-user', email: 'you@example.com', admitted: true, privacy_accepted: true }

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

export async function mockFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = new URL(String(input), 'http://mock')
  const path = url.pathname.replace('/api/v1', '')
  await new Promise((r) => setTimeout(r, 300))

  if (path === '/health') return json(200, { api: 'ok', db: 'ok' })

  if (path === '/me') return json(200, me)
  if (path === '/me/invite') {
    const { code } = JSON.parse(String(init?.body)) as { code: string }
    if (code.trim().toUpperCase() !== 'VX-DEMO') {
      return json(400, {
        error: {
          code: 'invalid_invite',
          message: "That invite code isn't valid or has been used.",
        },
      })
    }
    me = { ...me, admitted: true }
    return json(200, me)
  }
  if (path === '/me/privacy-accept') {
    me = { ...me, privacy_accepted: true }
    return json(200, me)
  }

  if (path === '/imports' && init?.method === 'POST') {
    const file = (init.body as FormData).get('file') as File
    if (!file.name.endsWith('.json')) {
      return json(400, {
        error: {
          code: 'invalid_file',
          message:
            "This isn't a Telegram export. Export your channel as JSON from Telegram Desktop.",
        },
      })
    }
    const job: ImportJob = {
      id: crypto.randomUUID(),
      platform: 'telegram',
      status: 'embedding',
      parsed: 412,
      skipped: {
        forwarded: 135,
        too_short: 54,
        empty: 50,
        link_only: 32,
        service: 21,
        excluded_topic: 4,
      },
      embedded: 0,
      waiting: 412,
    }
    imports.set(job.id, job)
    return json(201, job)
  }

  const importMatch = path.match(/^\/imports\/(.+)$/)
  if (importMatch) {
    const job = imports.get(importMatch[1])
    if (!job) return json(404, { error: { code: 'not_found', message: 'Not found.' } })
    const embedded = Math.min(job.parsed, job.embedded + 120)
    const next: ImportJob = {
      ...job,
      embedded,
      waiting: job.parsed - embedded,
      status: embedded === job.parsed ? 'done' : 'embedding',
    }
    imports.set(job.id, next)
    return json(200, next)
  }

  if (path === '/drafts/generate') {
    const { platform } = JSON.parse(String(init?.body)) as { platform: Draft['platform'] }
    const text =
      'Small win today: the Telegram importer works end to end.\n\n412 posts in, 31 skipped.'
    return json(201, {
      id: crypto.randomUUID(),
      platform,
      status: 'draft',
      text,
      length: { count: text.length, limit: platform === 'x' ? 280 : 4096, over: false },
      model: 'mock',
      examples_used: 8,
      created_at: new Date().toISOString(),
    } satisfies Draft)
  }

  return json(404, { error: { code: 'not_found', message: `No mock for ${path}.` } })
}
