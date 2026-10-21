import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, vi } from 'vitest'
import { api } from '../../api/client'
import type { Profile } from '../../api/profile'
import { AboutYou } from './AboutYou'

vi.mock('../../api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/client')>()),
  api: vi.fn(),
}))

const empty: Profile = {
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

let saved: Profile
beforeEach(() => {
  vi.clearAllMocks()
  saved = { ...empty }
  vi.mocked(api).mockImplementation(async (path, init) => {
    if (init?.method === 'PUT') Object.assign(saved, JSON.parse(String(init.body)))
    if (path === '/profile/summary') {
      saved = {
        ...saved,
        summary_card: 'I build Voxlace.',
        summary_updated_at: '2026-10-21T16:00:00Z',
      }
    }
    return { ...saved } as never
  })
})

function renderAbout() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <AboutYou />
    </QueryClientProvider>,
  )
}

const bodies = () =>
  vi
    .mocked(api)
    .mock.calls.filter((c) => c[1]?.method === 'PUT')
    .map((c) => JSON.parse(String(c[1]?.body)) as Partial<Profile>)

test('saves the answers, language and cleaned hashtags', async () => {
  renderAbout()
  await userEvent.type(await screen.findByLabelText('Role'), 'Backend developer')
  await userEvent.selectOptions(screen.getByLabelText('Write drafts in'), 'Amharic')
  const tags = screen.getByLabelText('Skip posts with these hashtags')
  await userEvent.clear(tags)
  await userEvent.type(tags, '#family,  #kids')
  await userEvent.click(screen.getByRole('button', { name: 'Save profile' }))

  expect(await screen.findByText('Saved')).toBeInTheDocument()
  expect(bodies()[0]).toMatchObject({
    role: 'Backend developer',
    language: 'Amharic',
    excluded_hashtags: ['#family', '#kids'],
    summary_card: '',
  })
})

test('saves typed answers first, then shows the card the AI wrote', async () => {
  renderAbout()
  await userEvent.type(await screen.findByLabelText('Current projects'), 'Voxlace')
  await userEvent.click(screen.getByRole('button', { name: 'Write it from my answers' }))

  expect(await screen.findByDisplayValue('I build Voxlace.')).toBeInTheDocument()
  expect(bodies()[0]).toMatchObject({ current_projects: 'Voxlace' })
  const order = vi.mocked(api).mock.calls.map((c) => `${c[1]?.method ?? 'GET'} ${c[0]}`)
  expect(order.indexOf('PUT /profile')).toBeLessThan(order.indexOf('POST /profile/summary'))
  // The answer typed before the rewrite is still there.
  expect(screen.getByLabelText('Current projects')).toHaveValue('Voxlace')
})

test('keeps what was typed when the AI is busy', async () => {
  vi.mocked(api).mockImplementation(async (path, init) => {
    if (path === '/profile/summary') {
      const { ApiError } =
        await vi.importActual<typeof import('../../api/client')>('../../api/client')
      throw new ApiError(503, 'ai_unavailable', 'The AI is busy. Try again in a minute.')
    }
    if (init?.method === 'PUT') Object.assign(saved, JSON.parse(String(init.body)))
    return { ...saved } as never
  })
  renderAbout()
  const card = await screen.findByLabelText('Summary card text')
  await userEvent.type(card, 'My own words')
  await userEvent.click(screen.getByRole('button', { name: 'Rewrite from my answers' }))

  expect(await screen.findByRole('alert')).toHaveTextContent('The AI is busy')
  expect(card).toHaveValue('My own words')
})
