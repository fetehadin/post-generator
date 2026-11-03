import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, vi } from 'vitest'
import type { PlatformInfo } from '../../api/platforms'
import type { Reminders } from '../../api/types'
import { routeApi, sent } from '../../test/fakeApi'
import { ProfilePage } from './ProfilePage'

vi.mock('../../api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/client')>()),
  api: vi.fn(),
}))

// About you has its own tests (AboutYou.test.tsx); here only the time zone above it matters.
vi.mock('./AboutYou', () => ({ AboutYou: () => null }))

const platformInfo = (over: Partial<PlatformInfo> = {}): PlatformInfo => ({
  platform: 'x',
  rules: { char_limit: 280, counting_rule: 'weighted', tone_notes: '', structure_notes: '' },
  effective_limit: 280,
  stats: {
    post_count: 0,
    thin: true,
    median_length: 0,
    median_lines: 0,
    emoji_share: 0,
    hashtag_share: 0,
    link_share: 0,
    question_share: 0,
    ethiopic_share: 0,
    top_hashtags: [],
  },
  voice_card: '',
  voice_card_updated_at: null,
  x_premium: false,
  premium_source: null,
  audience_places: [{ timezone: 'Africa/Addis_Ababa', share: 70 }],
  audience_profession: 'developers',
  goal: '',
  posts_per_week: 3,
  channel: null,
  ...over,
})

let reminders: Reminders
beforeEach(() => {
  vi.clearAllMocks()
  reminders = { enabled: false, days: [0, 1, 2, 3, 4], local_time: '18:00' }
  routeApi({
    'GET /me': () => ({
      id: 'u',
      email: 'a@b.c',
      admitted: true,
      privacy_accepted: true,
      timezone: 'Africa/Addis_Ababa',
    }),
    'PATCH /me': (b) => ({
      id: 'u',
      email: 'a@b.c',
      admitted: true,
      privacy_accepted: true,
      ...(b as object),
    }),
    'GET /me/reminders': () => reminders,
    'PUT /me/reminders': (b) => (reminders = b as Reminders),
    'GET /platforms/:p': () => platformInfo(),
    'PUT /platforms/:p/settings': (b) => platformInfo(b as Partial<PlatformInfo>),
    'GET /platforms/:p/best-hours': () => ({
      platform: 'x',
      timezone: 'Africa/Addis_Ababa',
      source: 'studies',
      days: [{ date: 'x', scores: [], best: [9, 18] }],
    }),
  })
})

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <ProfilePage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

test('the tab comes from the address', async () => {
  renderAt('/profile?tab=when')
  expect(screen.getByRole('tab', { name: 'When you post' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  expect(await screen.findByRole('button', { name: 'Save reminders' })).toBeTruthy()
})

test('audience: places, profession and posts per week are saved for the platform', async () => {
  renderAt('/profile?tab=audience')
  const zone = await screen.findByLabelText('Time zone 1')
  expect(zone).toHaveValue('Africa/Addis_Ababa')
  await userEvent.click(screen.getByRole('button', { name: 'Add a place' }))
  fireEvent.change(screen.getByLabelText('Time zone 2'), { target: { value: 'Europe/Berlin' } })
  await userEvent.click(screen.getByRole('button', { name: 'Save X audience' }))
  expect(await screen.findByText('Saved.')).toBeTruthy()
  expect(sent('PUT /platforms/x/settings')[0]).toEqual({
    audience_profession: 'developers',
    audience_places: [
      { timezone: 'Africa/Addis_Ababa', share: 70 },
      { timezone: 'Europe/Berlin', share: 30 },
    ],
    goal: '',
    posts_per_week: 3,
  })
  expect(screen.getByText(/best hours for X/)).toBeTruthy()
})

test('audience: a zone that does not exist is caught before saving', async () => {
  renderAt('/profile?tab=audience')
  fireEvent.change(await screen.findByLabelText('Time zone 1'), { target: { value: 'Mars/Base' } })
  expect(screen.getByRole('alert')).toHaveTextContent('"Mars/Base" isn\'t a time zone')
  expect(screen.getByRole('button', { name: 'Save X audience' })).toBeDisabled()
})

test('reminders: turn on, pick days and a time, save', async () => {
  renderAt('/profile?tab=when')
  await userEvent.click(await screen.findByLabelText('Remind me to check in'))
  await userEvent.click(screen.getByRole('button', { name: 'Fri' })) // off
  await userEvent.click(screen.getByRole('button', { name: 'Sat' })) // on
  fireEvent.change(screen.getByLabelText('At'), { target: { value: '20:30' } })
  await userEvent.click(screen.getByRole('button', { name: 'Save reminders' }))
  expect(await screen.findByText('Saved.')).toBeTruthy()
  expect(sent('PUT /me/reminders')[0]).toEqual({
    enabled: true,
    days: [0, 1, 2, 3, 5],
    local_time: '20:30',
  })
})

test('time zone: a new zone is saved; an unknown one is not', async () => {
  renderAt('/profile')
  const field = await screen.findByLabelText('Your time zone')
  await vi.waitFor(() => expect(field).toHaveValue('Africa/Addis_Ababa'))
  fireEvent.change(field, { target: { value: 'Nowhere/Land' } })
  expect(screen.getByRole('button', { name: 'Save time zone' })).toBeDisabled()
  fireEvent.change(field, { target: { value: 'Europe/Berlin' } })
  await userEvent.click(screen.getByRole('button', { name: 'Save time zone' }))
  await vi.waitFor(() => expect(sent('PATCH /me')).toEqual([{ timezone: 'Europe/Berlin' }]))
})

test('audience: a zone alias the browser reports is accepted; an empty share is caught', async () => {
  renderAt('/profile?tab=audience')
  const zone = await screen.findByLabelText('Time zone 1')
  fireEvent.change(zone, { target: { value: 'Asia/Calcutta' } })
  expect(screen.queryByRole('alert')).toBeNull()
  fireEvent.change(screen.getByLabelText('Share (%)'), { target: { value: '' } })
  expect(screen.getByRole('alert')).toHaveTextContent('Each share is a number from 1 to 100.')
})

test('audience: switching platforms keeps unsaved edits', async () => {
  renderAt('/profile?tab=audience')
  fireEvent.change(await screen.findByLabelText('Your goal on X'), { target: { value: 'Ship' } })
  await userEvent.click(screen.getByRole('button', { name: 'LinkedIn' }))
  await userEvent.click(screen.getByRole('button', { name: 'X' }))
  expect(screen.getByLabelText('Your goal on X')).toHaveValue('Ship')
})
