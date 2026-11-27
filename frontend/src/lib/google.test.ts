import { describe, expect, it } from 'vitest'
import { googleClientId, makeNonce } from './google'

describe('Google sign-in (FR-27)', () => {
  it('hashes the nonce with SHA-256, as Supabase checks it', async () => {
    const { raw, hashed } = await makeNonce()
    expect(raw).toMatch(/^[A-Za-z0-9_-]{32}$/)
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw))
    const want = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
    expect(hashed).toBe(want)
  })

  it('makes a new nonce every time', async () => {
    const [a, b] = await Promise.all([makeNonce(), makeNonce()])
    expect(a.raw).not.toBe(b.raw)
  })

  it('uses a public web client ID, never a secret', () => {
    expect(googleClientId).toMatch(/\.apps\.googleusercontent\.com$/)
    expect(googleClientId).not.toMatch(/GOCSPX/)
  })
})
