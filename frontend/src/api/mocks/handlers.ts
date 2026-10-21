/**
 * A fake backend for building screens before (or without) the API: VITE_USE_MOCKS=true.
 * Shapes match docs/API.md. Imports "learn" 120 posts per poll, so progress is visible.
 */
import type { Profile } from '../profile'
import type { Draft, ImportJob, Platform, Post } from '../types'

const platformInfo: Partial<
  Record<
    Platform,
    {
      voice_card: string
      voice_card_updated_at: string | null
      x_premium: boolean | null
      premium_source: 'user' | 'export' | null
    }
  >
> = {}

const profile: Profile = {
  role: '',
  stack: '',
  current_projects: '',
  focus: '',
  goal: '',
  topics: '',
  audience: '',
  avoid_list: '',
  voice_words: '',
  links: '',
  discipline: '',
  usual_hours: '',
  language: 'auto',
  excluded_hashtags: ['#family', '#me'],
  summary_card: '',
  summary_updated_at: null,
}

const imports = new Map<string, ImportJob>()
const posts: Post[] = [
  'Ship log: fixed the timezone bug. Everything is UTC in the database now and only converted at the edges.',
  '#buildinpublic week 3: 41 users, 2 bug reports, 1 very kind email. Small numbers, real people.',
  "Shipped v0.2 of the CSV cleaner: streaming reads, so 2 GB files don't kill my laptop.",
].map((text, i) => ({
  id: `mock-post-${i}`,
  platform: 'telegram',
  text,
  posted_at: new Date(Date.UTC(2026, 8, 20 - i * 5)).toISOString(),
  likes: [14, 22, 9][i],
  pinned: false,
  excluded: false,
  embedded: true,
}))
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
    const form = init.body as FormData
    const file = form.get('file') as File
    if (form.get('platform') === 'x' && file.name.endsWith('.zip')) {
      const job: ImportJob = {
        id: crypto.randomUUID(),
        platform: 'x',
        status: 'embedding',
        parsed: 72,
        skipped: { reply: 225, repost: 3, too_short: 3, link_only: 1 },
        embedded: 0,
        waiting: 72,
        premium_hint: true,
      }
      imports.set(job.id, job)
      return json(201, job)
    }
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

  if (path === '/posts') {
    const platform = url.searchParams.get('platform') ?? 'telegram'
    const q = (url.searchParams.get('q') ?? '').toLowerCase()
    const show = url.searchParams.get('show') ?? 'all'
    const items = posts.filter(
      (p) =>
        p.platform === platform &&
        p.text.toLowerCase().includes(q) &&
        (show === 'all' || (show === 'pinned' ? p.pinned : p.excluded)),
    )
    return json(200, { items, next_cursor: null })
  }
  const postMatch = path.match(/^\/posts\/(.+)$/)
  if (postMatch && init?.method === 'PATCH') {
    const change = JSON.parse(String(init.body)) as { pinned?: boolean; excluded?: boolean }
    const p = posts.find((x) => x.id === postMatch[1])
    if (!p) return json(404, { error: { code: 'not_found', message: 'Not found.' } })
    if (change.pinned !== undefined)
      Object.assign(p, { pinned: change.pinned }, change.pinned && { excluded: false })
    if (change.excluded !== undefined)
      Object.assign(p, { excluded: change.excluded }, change.excluded && { pinned: false })
    return json(200, p)
  }

  if (path === '/profile') {
    if (init?.method === 'PUT') {
      const change = JSON.parse(String(init.body)) as Partial<Profile>
      if (change.summary_card !== undefined) profile.summary_updated_at = new Date().toISOString()
      Object.assign(profile, change)
    }
    return json(200, profile)
  }
  if (path === '/profile/summary') {
    profile.summary_card = `I'm a ${profile.role || 'developer'} working on ${profile.current_projects || 'my projects'}. I write for ${profile.audience || 'people who build things'}.`
    profile.summary_updated_at = new Date().toISOString()
    return json(200, profile)
  }

  const platformMatch = path.match(/^\/platforms\/(telegram|x|linkedin)(\/.*)?$/)
  if (platformMatch) {
    const id = platformMatch[1] as Platform
    const mine = posts.filter((p) => p.platform === id && !p.excluded)
    const info = (platformInfo[id] ??= {
      voice_card: '',
      voice_card_updated_at: null as string | null,
      x_premium: null as boolean | null,
      premium_source: null as 'user' | 'export' | null,
    })
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {}
    const now = new Date().toISOString()
    if (platformMatch[2] === '/voice-card' && init?.method === 'POST')
      Object.assign(info, {
        voice_card: '- Short posts, one idea each.\n- Ends with a question.',
        voice_card_updated_at: now,
      })
    if (platformMatch[2] === '/voice-card' && init?.method === 'PUT')
      Object.assign(info, { voice_card: body.voice_card, voice_card_updated_at: now })
    if (platformMatch[2] === '/settings')
      Object.assign(info, { x_premium: body.x_premium, premium_source: 'user' })
    const limit = id === 'x' ? 280 : id === 'linkedin' ? 3000 : 4096
    return json(200, {
      platform: id,
      rules: {
        char_limit: limit,
        counting_rule: id === 'x' ? 'x_weighted' : 'plain',
        tone_notes: 'Direct and warm.',
        structure_notes: 'Hook first, short lines.',
      },
      effective_limit: id === 'x' && info.x_premium ? 25000 : limit,
      stats: {
        post_count: mine.length,
        thin: mine.length < 20,
        median_length: 240,
        median_lines: 3,
        emoji_share: 0.4,
        hashtag_share: 0.1,
        link_share: 0.2,
        question_share: 0.1,
        ethiopic_share: 0.3,
        top_hashtags: ['#python'],
      },
      ...info,
    })
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
