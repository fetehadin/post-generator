import { accessToken } from '../lib/auth'
import { mockFetch } from './mocks/handlers'

/** Every backend error has the shape {"error": {"code", "message"}} (docs/API.md). */
export class ApiError extends Error {
  readonly code: string
  readonly status: number

  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

const BASE = '/api/v1'

// VITE_USE_MOCKS=true npm run dev: build screens against docs/API.md without the backend.
const send: typeof fetch =
  import.meta.env.VITE_USE_MOCKS === 'true' ? mockFetch : (...a) => fetch(...a)

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    const token = await accessToken()
    const headers = new Headers(init?.headers)
    if (token) headers.set('Authorization', `Bearer ${token}`)
    res = await send(BASE + path, { ...init, headers })
  } catch {
    throw new ApiError(0, 'network_error', "Can't reach the server. Check your connection.")
  }
  const body: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    const err = (body as { error?: { code?: string; message?: string } } | null)?.error
    throw new ApiError(
      res.status,
      err?.code ?? 'unknown_error',
      err?.message ?? plainError(res.status),
    )
  }
  return body as T
}

/** No message from the server: say what happened in plain words, never a status code. */
export function plainError(status: number): string {
  if (status === 401 || status === 403) return 'Your session ended. Log in again to go on.'
  if (status === 404) return "That isn't here any more. Go back and try again."
  if (status === 429) return 'Too many tries at once. Wait a minute, then try again.'
  if (status >= 500)
    return 'Voxlace had a problem on its side. Your text is kept; try again in a minute.'
  return "That didn't work. Try again."
}

/** A JSON request body: `api(path, json('POST', {...}))`. */
export const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})
