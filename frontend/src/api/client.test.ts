import { afterEach, vi } from 'vitest'
import { api, ApiError } from './client'

function answer(status: number, body: unknown) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status })))
}

afterEach(() => vi.unstubAllGlobals())

test('returns the JSON body and calls /api/v1', async () => {
  answer(200, { api: 'ok' })
  await expect(api('/health')).resolves.toEqual({ api: 'ok' })
  expect(fetch).toHaveBeenCalledWith('/api/v1/health', undefined)
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
