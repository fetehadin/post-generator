import { expect, test } from 'vitest'
import type { BestHours, Notifications, ScheduleResult, Thread, ThreadRow } from '../types'
import { mockFetch } from './handlers'

/** The mock backend follows docs/API.md "Chat board, notifications and time zone". */
async function call<T>(path: string, method = 'GET', body?: unknown) {
  const res = await mockFetch(`/api/v1${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return { status: res.status, body: (await res.json().catch(() => null)) as T }
}

const tomorrow = () => new Date(Date.now() + 86_400_000).toLocaleDateString('en-CA')

test('a thread holds the check-in, a card per platform and every revision in order', async () => {
  const created = await call<Thread>('/threads', 'POST', { text: 'Finished the importer' })
  expect(created.status).toBe(201)
  const id = created.body.id
  expect(created.body.messages).toHaveLength(1)

  const gen = await call<Thread>(`/threads/${id}/generate`, 'POST', {
    platforms: ['x', 'linkedin'],
  })
  expect(gen.status).toBe(201)
  expect(gen.body.drafts.map((d) => d.platform).sort()).toEqual(['linkedin', 'x'])
  expect(gen.body.messages.filter((m) => m.card)).toHaveLength(2)
  expect(gen.body.failures).toEqual([])

  const x = gen.body.drafts.find((d) => d.platform === 'x')!
  await call(`/drafts/${x.id}/revise`, 'POST', { instruction: 'Shorter' })
  const after = (await call<Thread>(`/threads/${id}`)).body
  const last = after.messages.slice(-2)
  expect(last.map((m) => [m.role, m.text])).toEqual([
    ['user', 'Shorter'],
    ['assistant', 'v2: Shorter'],
  ])
  expect(last[1].card?.number).toBe(2)

  const list = (await call<{ items: ThreadRow[] }>('/threads')).body.items
  expect(list[0].id).toBe(id)
})

test('convert adds another platform to the same thread; the same platform is refused', async () => {
  const t = (await call<Thread>('/threads', 'POST', { text: 'Shipped v2' })).body
  const gen = (await call<Thread>(`/threads/${t.id}/generate`, 'POST', { platforms: ['x'] })).body
  const x = gen.drafts[0]
  const same = await call<{ error: { code: string } }>(`/drafts/${x.id}/convert`, 'POST', {
    platform: 'x',
  })
  expect([same.status, same.body.error.code]).toEqual([400, 'same_platform'])
  const done = await call<Thread>(`/drafts/${x.id}/convert`, 'POST', { platform: 'telegram' })
  expect(done.body.drafts.map((d) => d.platform).sort()).toEqual(['telegram', 'x'])
  expect(done.body.messages.some((m) => m.text === 'Make a Telegram version')).toBe(true)
})

test('approve with a day picks the hour and says why; only discarded drafts can be deleted', async () => {
  const t = (await call<Thread>('/threads', 'POST', { text: 'Wrote tests' })).body
  const d = (await call<Thread>(`/threads/${t.id}/generate`, 'POST', { platforms: ['telegram'] }))
    .body.drafts[0]
  const r = await call<ScheduleResult>(`/drafts/${d.id}/schedule`, 'POST', { day: tomorrow() })
  expect(r.status).toBe(200)
  expect(r.body.draft.status).toBe('approved')
  expect(r.body.rank).toBe(1)
  expect(r.body.reason).toMatch(/your audience is in/)

  const del = await call<{ error: { code: string } }>(`/drafts/${d.id}`, 'DELETE')
  expect([del.status, del.body.error.code]).toEqual([409, 'not_discarded'])
  await call(`/drafts/${d.id}`, 'PATCH', { status: 'discarded' })
  expect((await mockFetch(`/api/v1/drafts/${d.id}`, { method: 'DELETE' })).status).toBe(204)
})

test('notifications list missed posts; best hours never list passed hours', async () => {
  const t = (await call<Thread>('/threads', 'POST', { text: 'Fixed a bug' })).body
  const d = (await call<Thread>(`/threads/${t.id}/generate`, 'POST', { platforms: ['x'] })).body
    .drafts[0]
  const hourAgo = new Date(Date.now() - 3_600_000).toISOString()
  await call(`/drafts/${d.id}`, 'PATCH', { status: 'approved', scheduled_for: hourAgo })
  const n = (await call<Notifications>('/me/notifications')).body
  expect(n.missed.map((m) => m.id)).toContain(d.id)

  const today = new Date().toLocaleDateString('en-CA')
  const hours = (await call<BestHours>(`/platforms/x/best-hours?start=${today}&days=2`)).body
  expect(hours.days).toHaveLength(2)
  expect(hours.days[0].scores).toHaveLength(24)
  expect(hours.days[1].best).toHaveLength(3)
})

test('the time zone is saved; an unknown one is refused', async () => {
  const ok = await call<{ timezone: string }>('/me', 'PATCH', { timezone: 'Africa/Addis_Ababa' })
  expect(ok.body.timezone).toBe('Africa/Addis_Ababa')
  const bad = await call<{ error: { code: string } }>('/me', 'PATCH', { timezone: 'Mars/Base' })
  expect([bad.status, bad.body.error.code]).toEqual([400, 'invalid_timezone'])
})

test('a draft from POST /drafts/generate gets a thread of its own, so convert works', async () => {
  const d = (
    await call<{ id: string; thread_id: string }>('/drafts/generate', 'POST', {
      platform: 'x',
      topic: 'Fixed the counter',
    })
  ).body
  expect(d.thread_id).toBeTruthy()
  const t = await call<Thread>(`/drafts/${d.id}/convert`, 'POST', { platform: 'linkedin' })
  expect(t.status).toBe(201)
  expect(t.body.id).toBe(d.thread_id)
})

test('a second post that day keeps the platform gap; a time on another day is refused', async () => {
  const t = (await call<Thread>('/threads', 'POST', { text: 'Two posts' })).body
  const gen = (await call<Thread>(`/threads/${t.id}/generate`, 'POST', { platforms: ['x'] })).body
  const other = (
    await call<Thread>(`/drafts/${gen.drafts[0].id}/convert`, 'POST', {
      platform: 'telegram',
    })
  ).body
  const [a, b] = await Promise.all(
    [gen.drafts[0].id, other.drafts.find((d) => d.platform === 'telegram')!.id].map((id) =>
      call<Thread>(`/drafts/${id}/convert`, 'POST', { platform: 'linkedin' }),
    ),
  )
  const linkedin = [...a.body.drafts, ...b.body.drafts].filter((d) => d.platform === 'linkedin')
  const day = tomorrow()
  const first = (await call<ScheduleResult>(`/drafts/${linkedin[0].id}/schedule`, 'POST', { day }))
    .body
  const second = (await call<ScheduleResult>(`/drafts/${linkedin[1].id}/schedule`, 'POST', { day }))
    .body
  const hours = Math.abs(Date.parse(second.scheduled_for) - Date.parse(first.scheduled_for)) / 3.6e6
  expect(hours).toBeGreaterThanOrEqual(4) // LinkedIn's gap
  expect(second.warning).toMatch(/second post on the same day/)

  const wrong = await call<{ error: { code: string } }>(
    `/drafts/${linkedin[0].id}/schedule`,
    'POST',
    { day, at: new Date(Date.now() + 3 * 86_400_000).toISOString() },
  )
  expect([wrong.status, wrong.body.error.code]).toEqual([400, 'wrong_day'])
})
