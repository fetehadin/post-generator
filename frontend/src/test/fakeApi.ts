import { vi } from 'vitest'
import { api } from '../api/client'

type Handler = (body: unknown, init?: RequestInit) => unknown

/**
 * Route the mocked `api()` by "METHOD /path" (query string ignored), so a page that calls
 * several endpoints can be tested. An unknown route throws, which fails the test loudly.
 * Use with `vi.mock('../../api/client', …)` in the test file.
 */
export function routeApi(routes: Record<string, Handler>) {
  vi.mocked(api).mockImplementation(async (path, init) => {
    const key = `${init?.method ?? 'GET'} ${String(path).split('?')[0]}`
    const match = Object.entries(routes).find(([pattern]) =>
      new RegExp(`^${pattern.replace(/:\w+/g, '[^/]+')}$`).test(key),
    )
    if (!match) throw new Error(`No fake for ${key}`)
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    return (await match[1](body, init)) as never
  })
}

/** Every call as "METHOD /path?query". */
export const calls = () =>
  vi.mocked(api).mock.calls.map((c) => `${c[1]?.method ?? 'GET'} ${String(c[0])}`)

/** The JSON bodies sent to one route, in order. */
export const sent = (key: string) =>
  vi
    .mocked(api)
    .mock.calls.filter((c) => `${c[1]?.method ?? 'GET'} ${String(c[0]).split('?')[0]}` === key)
    .map((c) => JSON.parse(String(c[1]?.body)) as Record<string, unknown>)
