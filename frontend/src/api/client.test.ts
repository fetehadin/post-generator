import { afterEach, vi } from 'vitest'
import { accessToken } from '../lib/auth'
import { api, ApiError } from './client'

vi.mock('../lib/auth', () => ({ accessToken: vi.fn().mockResolvedValue(null), supabase: null }))

function answer(status: number, body: unknown) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status })))
}

afterEach(() => vi.unstubAllGlobals())

test('returns the JSON body and calls /api/v1', async () => {
  answer(200, { api: 'ok' })
  await expect(api('/health')).resolves.toEqual({ api: 'ok' })
  expect(vi.mocked(fetch).mock.calls[0][0]).toBe('/api/v1/health')
})

test("turns the API's error shape into an ApiError", async () => {
  answer(404, { error: { code: 'not_found', message: 'Not found.' } })
  await expect(api('/x')).rejects.toMatchObject({
    status: 404,
    code: 'not_found',
    message: 'Not found.',
  })
})

test('explains a network failure in plain words', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
  const err = await api('/health').catch((e: unknown) => e)
  expect(err).toBeInstanceOf(ApiError)
  expect((err as ApiError).message).toMatch("Can't reach the server")
})

test('sends the login token as Bearer when logged in', async () => {
  vi.mocked(accessToken).mockResolvedValueOnce('tok-123')
  answer(200, {})
  await api('/me')
  const init = vi.mocked(fetch).mock.calls[0][1] as RequestInit
  expect(new Headers(init.headers).get('Authorization')).toBe('Bearer tok-123')
})

test('sends no Authorization header when logged out', async () => {
  answer(200, {})
  await api('/me')
  const init = vi.mocked(fetch).mock.calls[0][1] as RequestInit
  expect(new Headers(init.headers).has('Authorization')).toBe(false)
})
