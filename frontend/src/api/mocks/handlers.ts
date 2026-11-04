/**
 * A fake backend for building screens before (or without) the API: VITE_USE_MOCKS=true.
 * Shapes match docs/API.md. Imports "learn" 120 posts per poll, so progress is visible.
 */
import type { Profile } from '../profile'
import type { Upload } from '../uploads'
import type {
  AudiencePlace,
  AudienceProfession,
  Checkin,
  DraftDetail,
  DraftRow,
  ImportJob,
  Platform,
  Post,
  Reminders,
  ThreadMessage,
} from '../types'

const drafts: DraftDetail[] = []
const checkins: Checkin[] = []

/** Chat threads (docs/API.md "Threads"): drafts point back with `thread_id`. */
type MockThread = {
  id: string
  title: string
  checkin_id: string | null
  checkin_text: string
  created_at: string
  updated_at: string
  messages: ThreadMessage[]
}
const threads: MockThread[] = []
let reminders: Reminders = { enabled: false, days: [0, 1, 2, 3, 4], local_time: '18:00' }
const NAMES: Record<Platform, string> = { x: 'X', linkedin: 'LinkedIn', telegram: 'Telegram' }
const LIMITS: Record<Platform, number> = { x: 280, linkedin: 3000, telegram: 4096 }
const SAMPLE: Record<Platform, string> = {
  x: 'Small win today: the Telegram importer works end to end.\n\n412 posts in, 31 skipped.',
  linkedin:
    'The Telegram importer works end to end.\n\n412 posts came in and 31 were skipped, each with a reason I can show the user.\n\nWhat I learned: flatten formatted text before you count anything.',
  telegram: 'Small win today: the Telegram importer works end to end.\n\n412 posts in, 31 skipped.',
}

const row = (d: DraftDetail): DraftRow => ({
  id: d.id,
  platform: d.platform,
  status: d.status,
  text: d.text,
  length: d.length,
  scheduled_for: d.scheduled_for,
  published_at: d.published_at,
  created_at: d.created_at,
  updated_at: d.updated_at,
  thread_id: d.thread_id ?? null,
})

function newDraft(platform: Platform, topic: string, threadId: string | null, text?: string) {
  const body = text ?? SAMPLE[platform]
  const now = new Date().toISOString()
  const d: DraftDetail = {
    id: crypto.randomUUID(),
    platform,
    status: 'draft',
    text: body,
    length: { count: body.length, limit: LIMITS[platform], over: body.length > LIMITS[platform] },
    scheduled_for: null,
    published_at: null,
    created_at: now,
    updated_at: now,
    thread_id: threadId,
    topic,
    checkin_id: null,
    versions: [
      { id: crypto.randomUUID(), number: 1, text: body, instruction: null, created_at: now },
    ],
    messages: [],
  }
  drafts.unshift(d)
  return d
}

/** A message in the draft's thread; with `card`, the draft's newest version as a card. */
function say(d: DraftDetail, role: 'user' | 'assistant', text: string, card = false) {
  const t = threads.find((x) => x.id === d.thread_id)
  if (!t) return
  const v = d.versions[d.versions.length - 1]
  const now = new Date().toISOString()
  t.messages.push({
    id: crypto.randomUUID(),
    role,
    text,
    draft_id: d.id,
    card: card ? { version_id: v.id, number: v.number, text: v.text, length: d.length } : null,
    created_at: now,
  })
  t.updated_at = now
}

/** A new thread: today's check-in as its first message (POST /threads). */
function newThread(text: string, day?: string): MockThread {
  const now = new Date().toISOString()
  const c: Checkin = {
    id: crypto.randomUUID(),
    day: day ?? localDay(now),
    text,
    created_at: now,
    updated_at: now,
  }
  checkins.unshift(c)
  const t: MockThread = {
    id: crypto.randomUUID(),
    title: text.trim().split('\n')[0].slice(0, 60),
    checkin_id: c.id,
    checkin_text: text,
    created_at: now,
    updated_at: now,
    messages: [
      { id: crypto.randomUUID(), role: 'user', text, draft_id: null, card: null, created_at: now },
    ],
  }
  threads.unshift(t)
  return t
}

const threadOut = (t: MockThread) => ({
  ...t,
  drafts: drafts.filter((d) => d.thread_id === t.id).map(row),
})

/** The user's date of a UTC time, in the mock user's zone. */
const localDay = (iso: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: me.timezone }).format(new Date(iso))

/** Wall-clock `hour`:00 on `day` in the mock user's zone, as a UTC ISO string. */
function atLocal(day: string, hour: number): string {
  const guess = new Date(`${day}T${String(hour).padStart(2, '0')}:00:00Z`)
  const shown = new Date(guess.toLocaleString('en-US', { timeZone: me.timezone }))
  const plain = new Date(guess.toLocaleString('en-US', { timeZone: 'UTC' }))
  return new Date(guess.getTime() - (shown.getTime() - plain.getTime())).toISOString()
}

/** Morning, midday, afternoon or evening of a UTC time on the mock user's clock. */
function band(iso: string): string {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: me.timezone,
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(new Date(iso)),
  )
  return hour < 11 ? 'morning' : hour < 14 ? 'midday' : hour < 17 ? 'afternoon' : 'evening'
}

/** A plausible audience curve: a morning and an evening peak, scaled to 1.0. */
const CURVE = Array.from({ length: 24 }, (_, h) =>
  Number(
    (0.15 + 0.85 * Math.max(Math.exp(-((h - 9) ** 2) / 6), Math.exp(-((h - 18) ** 2) / 5))).toFixed(
      4,
    ),
  ),
)

const platformInfo: Partial<
  Record<
    Platform,
    {
      voice_card: string
      voice_card_updated_at: string | null
      x_premium: boolean | null
      premium_source: 'user' | 'export' | null
      audience_places: AudiencePlace[]
      audience_profession: AudienceProfession
      goal: string
      posts_per_week: number | null
      channel: string | null
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
  seniority: '',
  facts: '',
  emoji_habit: '',
  hashtag_habit: '',
  portfolio_url: '',
  projects: [],
}

const uploads: Upload[] = []
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
let me = {
  id: 'mock-user',
  email: 'you@example.com',
  admitted: true,
  privacy_accepted: true,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

/**
 * Something to look at on first load: yesterday's chat with an X and a LinkedIn draft, a
 * LinkedIn post due now, a Telegram post missed two days ago, and two planned ones (all approved).
 */
function seed() {
  const back = (ms: number) => new Date(Date.now() - ms).toISOString()
  const t = newThread(
    'Finished the Telegram importer and wrote tests for formatted messages',
    localDay(back(86_400_000)),
  )
  t.created_at = t.updated_at = back(86_400_000)
  for (const platform of ['x', 'linkedin'] as Platform[]) {
    const d = newDraft(platform, t.checkin_text, t.id)
    say(d, 'assistant', '', true)
  }
  const due = drafts.find((d) => d.platform === 'linkedin')!
  Object.assign(due, { status: 'approved', scheduled_for: back(5 * 60_000) })
  const missed = newDraft('telegram', t.checkin_text, t.id)
  say(missed, 'assistant', '', true)
  Object.assign(missed, { status: 'approved', scheduled_for: back(2 * 86_400_000) })
  // Two planned ones ahead, so the calendar shows every state.
  for (const [platform, ahead] of [
    ['x', 2 * 3_600_000],
    ['telegram', 50 * 3_600_000], // never tomorrow, so a test's "approve for tomorrow" ranks first
  ] as [Platform, number][]) {
    const planned = newDraft(platform, t.checkin_text, t.id)
    say(planned, 'assistant', '', true)
    Object.assign(planned, { status: 'approved', scheduled_for: back(-ahead) })
  }
  t.updated_at = back(86_400_000)
}
seed()

export async function mockFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = new URL(String(input), 'http://mock')
  const path = url.pathname.replace('/api/v1', '')
  await new Promise((r) => setTimeout(r, 300))

  if (path === '/health') return json(200, { api: 'ok', db: 'ok' })

  if (path === '/me' && init?.method === 'PATCH') {
    const { timezone } = JSON.parse(String(init.body)) as { timezone: string }
    try {
      new Intl.DateTimeFormat('en', { timeZone: timezone })
    } catch {
      return json(400, {
        error: { code: 'invalid_timezone', message: 'Pick a time zone from the list.' },
      })
    }
    me = { ...me, timezone }
    return json(200, me)
  }
  if (path === '/me' && init?.method !== 'DELETE') return json(200, me)
  if (path === '/me/reminders') {
    if (init?.method === 'PUT') reminders = JSON.parse(String(init.body)) as Reminders
    return json(200, reminders)
  }
  if (path === '/me/notifications') {
    const now = Date.now()
    const approved = drafts.filter((d) => d.status === 'approved' && d.scheduled_for)
    const at = (d: DraftDetail) => Date.parse(d.scheduled_for!)
    const today = localDay(new Date().toISOString())
    const weekday = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7
    const [hh, mm] = reminders.local_time.split(':').map(Number)
    const minutes = Number(
      new Intl.DateTimeFormat('en-GB', {
        timeZone: me.timezone,
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      })
        .format(new Date())
        .split(':')
        .reduce((h, m) => String(Number(h) * 60 + Number(m))),
    )
    return json(200, {
      due: approved
        .filter((d) => at(d) >= now - 30 * 60_000 && at(d) <= now + 10 * 60_000)
        .map(row),
      missed: approved.filter((d) => at(d) < now - 30 * 60_000).map(row),
      checkin_reminder:
        reminders.enabled &&
        reminders.days.includes(weekday) &&
        minutes >= hh * 60 + mm &&
        !checkins.some((c) => c.day === today),
    })
  }
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

  if (path === '/uploads') return json(200, { items: uploads })
  if (path === '/uploads/resume' || path === '/uploads/portfolio') {
    const now = new Date().toISOString()
    const body = init?.body
    const source =
      body instanceof FormData
        ? (body.get('file') as File).name
        : (JSON.parse(String(body)) as { url: string }).url
    const upload: Upload = {
      id: crypto.randomUUID(),
      kind: path === '/uploads/resume' ? 'resume' : 'portfolio',
      source,
      text: 'Backend developer at Gebeta since 2023.\nBuilt a delivery app used in Addis.',
      removed: { emails: 1, phones: 1 },
      reviewed: false,
      created_at: now,
      updated_at: now,
    }
    uploads.unshift(upload)
    return json(201, upload)
  }
  const uploadMatch = path.match(/^\/uploads\/([\w-]+)$/)
  if (uploadMatch) {
    const i = uploads.findIndex((u) => u.id === uploadMatch[1])
    if (i < 0) return json(404, { error: { code: 'not_found', message: 'Not found.' } })
    if (init?.method === 'DELETE') {
      uploads.splice(i, 1)
      return new Response(null, { status: 204 })
    }
    const change = JSON.parse(String(init?.body)) as Partial<Upload>
    uploads[i] = { ...uploads[i], ...change, updated_at: new Date().toISOString() }
    return json(200, uploads[i])
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
      audience_places: [] as AudiencePlace[],
      audience_profession: 'general' as AudienceProfession,
      goal: '',
      posts_per_week: null as number | null,
      channel: null as string | null,
    })
    if (platformMatch[2] === '/best-hours') {
      const start = url.searchParams.get('start') ?? localDay(new Date().toISOString())
      const count = Number(url.searchParams.get('days') ?? 7)
      const soon = Date.now() + 15 * 60_000
      return json(200, {
        platform: id,
        timezone: me.timezone,
        source: 'studies',
        days: Array.from({ length: count }, (_, i) => {
          const date = new Date(Date.parse(`${start}T12:00:00Z`) + i * 86_400_000)
            .toISOString()
            .slice(0, 10)
          const open = Array.from({ length: 14 }, (_, k) => k + 8).filter(
            (h) => Date.parse(atLocal(date, h)) > soon,
          )
          const best = open.sort((a, b) => CURVE[b] - CURVE[a] || a - b).slice(0, 3)
          return { date, scores: CURVE, best }
        }),
      })
    }
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {}
    const now = new Date().toISOString()
    if (platformMatch[2] === '/voice-card' && init?.method === 'POST')
      Object.assign(info, {
        voice_card: '- Short posts, one idea each.\n- Ends with a question.',
        voice_card_updated_at: now,
      })
    if (platformMatch[2] === '/voice-card' && init?.method === 'PUT')
      Object.assign(info, { voice_card: body.voice_card, voice_card_updated_at: now })
    if (platformMatch[2] === '/settings') {
      if ('channel' in body && id !== 'telegram')
        return json(400, {
          error: { code: 'not_supported', message: 'Only Telegram has a channel name.' },
        })
      Object.assign(info, body)
      if ('x_premium' in body) info.premium_source = 'user'
      if (body.audience_places === null) info.audience_places = []
      if (body.audience_profession === null) info.audience_profession = 'general'
    }
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

  if (path === '/me/usage') {
    const today = new Date().toISOString().slice(0, 10)
    return json(200, {
      drafts: drafts.filter((d) => d.created_at.startsWith(today)).length,
      draft_limit: 40,
      posts: 0,
      post_limit: 3000,
      resets_at: new Date(Date.parse(today) + 86_400_000).toISOString(),
    })
  }
  if (path === '/me/export') return json(200, { profile, posts, drafts, checkins })
  if (path === '/me' && init?.method === 'DELETE') return new Response(null, { status: 204 })
  if (path === '/drafts/stats') {
    const published = drafts.filter((d) => d.status === 'published').length
    return json(200, {
      created: drafts.length,
      published,
      publish_rate: drafts.length ? published / drafts.length : null,
      edited: published ? 0.1 : null,
    })
  }

  if (path === '/checkins') {
    if (init?.method === 'POST') {
      const b = JSON.parse(String(init.body)) as { text: string; day?: string }
      const now = new Date().toISOString()
      const c: Checkin = {
        id: crypto.randomUUID(),
        day: b.day ?? now.slice(0, 10),
        text: b.text,
        created_at: now,
        updated_at: now,
      }
      checkins.unshift(c)
      return json(201, c)
    }
    return json(200, { items: checkins })
  }
  const checkinMatch = path.match(/^\/checkins\/(.+)$/)
  if (checkinMatch) {
    const i = checkins.findIndex((c) => c.id === checkinMatch[1])
    if (i < 0) return json(404, { error: { code: 'not_found', message: 'Not found.' } })
    // A thread reads its check-in live (threads.py): keep the two in step.
    const linked = threads.filter((t) => t.checkin_id === checkins[i].id)
    if (init?.method === 'DELETE') {
      checkins.splice(i, 1)
      for (const t of linked) Object.assign(t, { checkin_id: null, checkin_text: t.title })
      return new Response(null, { status: 204 })
    }
    Object.assign(checkins[i], JSON.parse(String(init?.body)), {
      updated_at: new Date().toISOString(),
    })
    // Like the backend: the thread's checkin_text follows; its first message keeps its text.
    for (const t of linked) t.checkin_text = checkins[i].text
    return json(200, checkins[i])
  }

  if (path === '/threads') {
    if (init?.method === 'POST') {
      const b = JSON.parse(String(init.body)) as { text: string; day?: string }
      if (!b.text.trim())
        return json(400, {
          error: { code: 'missing_text', message: 'Write what you did today first.' },
        })
      const t = newThread(b.text, b.day)
      return json(201, threadOut(t))
    }
    const items = [...threads]
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .slice(0, 50)
      .map((t) => ({
        id: t.id,
        title: t.title,
        platforms: [...new Set(drafts.filter((d) => d.thread_id === t.id).map((d) => d.platform))],
        updated_at: t.updated_at,
      }))
    return json(200, { items })
  }
  const threadMatch = path.match(/^\/threads\/([^/]+)(\/generate)?$/)
  if (threadMatch) {
    const t = threads.find((x) => x.id === threadMatch[1])
    if (!t) return json(404, { error: { code: 'not_found', message: 'Not found.' } })
    if (threadMatch[2]) {
      const { platforms } = JSON.parse(String(init?.body)) as { platforms: Platform[] }
      for (const platform of platforms) {
        const d = newDraft(platform, t.checkin_text, t.id)
        say(d, 'assistant', '', true)
      }
      return json(201, { ...threadOut(t), failures: [] })
    }
    return json(200, threadOut(t))
  }

  if (path === '/drafts/generate') {
    const { platform, topic } = JSON.parse(String(init?.body)) as {
      platform: Platform
      topic: string
    }
    // docs/API.md: it now puts its draft in a new thread of its own.
    const t = newThread(topic || 'From your summary card')
    const d = newDraft(platform, topic, t.id)
    say(d, 'assistant', '', true)
    return json(201, { ...row(d), model: 'mock', examples_used: 8 })
  }
  if (path === '/drafts') {
    const p = url.searchParams
    const items = drafts.filter(
      (d) =>
        (!p.get('status') || d.status === p.get('status')) &&
        (!p.get('platform') || d.platform === p.get('platform')) &&
        (!p.get('created_from') || d.created_at >= p.get('created_from')!) &&
        (!p.get('scheduled_from') ||
          (d.scheduled_for !== null &&
            d.scheduled_for >= p.get('scheduled_from')! &&
            d.scheduled_for < (p.get('scheduled_to') ?? '9999'))),
    )
    return json(200, { items })
  }
  const draftMatch = path.match(/^\/drafts\/([^/]+)(\/.*)?$/)
  if (draftMatch) {
    const d = drafts.find((x) => x.id === draftMatch[1])
    if (!d) return json(404, { error: { code: 'not_found', message: 'Not found.' } })
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, string>) : {}
    const now = new Date().toISOString()
    const addVersion = (text: string, instruction: string) => {
      const v = {
        id: crypto.randomUUID(),
        number: d.versions.length + 1,
        text,
        instruction,
        created_at: now,
      }
      d.versions.push(v)
      Object.assign(d, { text, updated_at: now })
      d.length = { ...d.length, count: text.length, over: text.length > d.length.limit }
      return v
    }
    if (draftMatch[2] === '/convert') {
      const platform = body.platform as Platform
      if (platform === d.platform)
        return json(400, {
          error: { code: 'same_platform', message: 'Pick a different platform.' },
        })
      const thread = threads.find((t) => t.id === d.thread_id)
      if (!thread) return json(404, { error: { code: 'not_found', message: 'Not found.' } })
      say(d, 'user', `Make a ${NAMES[platform]} version`)
      const copy = newDraft(platform, d.topic, thread.id)
      say(copy, 'assistant', '', true)
      return json(201, threadOut(thread))
    }
    if (draftMatch[2] === '/schedule') {
      if (d.status === 'discarded')
        return json(409, {
          error: { code: 'discarded', message: 'Restore this draft before you schedule it.' },
        })
      const day = body.day
      if (body.at && localDay(body.at) !== day)
        return json(400, {
          error: { code: 'wrong_day', message: "That time isn't on that day in your time zone." },
        })
      const taken = drafts
        .filter(
          (x) =>
            x.id !== d.id &&
            x.platform === d.platform &&
            x.scheduled_for &&
            ['approved', 'published'].includes(x.status) &&
            localDay(x.scheduled_for) === day,
        )
        .map((x) => Date.parse(x.scheduled_for!))
      const gap = { x: 2, telegram: 3, linkedin: 4 }[d.platform] * 3_600_000
      // Inside 08:00–22:00, at least 15 minutes from now, best score first (scheduling.py).
      const open = Array.from({ length: 14 }, (_, k) => k + 8)
        .map((h) => ({ h, t: atLocal(day, h) }))
        .filter(({ t }) => Date.parse(t) > Date.now() + 15 * 60_000)
        .sort((a, b) => CURVE[b.h] - CURVE[a.h] || a.h - b.h)
      const free = open.find(({ t }) => taken.every((o) => Math.abs(Date.parse(t) - o) >= gap))
      const at: string | undefined = body.at ?? (free ?? open[0])?.t
      if (!at)
        return json(400, {
          error: {
            code: 'no_time_left',
            message:
              'No time is left on that day between 08:00 and 22:00, the hours you post. Pick another day.',
          },
        })
      const city = me.timezone.split('/').pop()!.replace('_', ' ')
      Object.assign(d, { status: 'approved', scheduled_for: at, updated_at: now })
      const sameDay = drafts.filter(
        (x) =>
          x.id !== d.id &&
          x.platform === d.platform &&
          x.scheduled_for &&
          x.status === 'approved' &&
          localDay(x.scheduled_for) === day,
      )
      return json(200, {
        draft: row(d),
        scheduled_for: at,
        rank: sameDay.filter((x) => x.scheduled_for! < at).length + 1,
        reason: body.at
          ? 'You picked this time.'
          : `your audience is in ${city} · ${NAMES[d.platform]}'s ${band(at)} peak`,
        warning:
          d.platform === 'linkedin' && sameDay.length
            ? 'LinkedIn tends to show a second post on the same day to fewer people.'
            : null,
      })
    }
    if (init?.method === 'DELETE') {
      if (d.status !== 'discarded')
        return json(409, { error: { code: 'not_discarded', message: 'Discard this draft first.' } })
      drafts.splice(drafts.indexOf(d), 1)
      return new Response(null, { status: 204 })
    }
    if (draftMatch[2] === '/revise') {
      const v = addVersion(`${d.text.split('\n')[0]}`, body.instruction)
      say(d, 'user', body.instruction)
      say(d, 'assistant', `v${v.number}: ${body.instruction}`, true)
      d.messages.push(
        {
          id: crypto.randomUUID(),
          role: 'user',
          text: body.instruction,
          version_id: null,
          created_at: now,
        },
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          text: `v${v.number}: ${body.instruction}`,
          version_id: v.id,
          created_at: now,
        },
      )
    } else if (draftMatch[2]?.endsWith('/restore')) {
      const old = d.versions.find((v) => draftMatch[2]!.includes(v.id))
      if (old) {
        addVersion(old.text, `Restored v${old.number}`)
        say(d, 'user', `Restored v${old.number}`, true)
      }
    } else if (init?.method === 'PATCH') {
      if (body.text && body.text !== d.text) {
        addVersion(body.text, 'Edited by hand')
        say(d, 'user', 'Edited by hand', true)
      }
      if (body.status) d.status = body.status as DraftDetail['status']
      if (body.status === 'published') d.published_at = now
      if (body.status === 'draft' || body.status === 'discarded') d.scheduled_for = null
      if ('scheduled_for' in body) d.scheduled_for = body.scheduled_for
    }
    return json(200, { ...d, thread_id: d.thread_id ?? null })
  }

  return json(404, { error: { code: 'not_found', message: `No mock for ${path}.` } })
}
