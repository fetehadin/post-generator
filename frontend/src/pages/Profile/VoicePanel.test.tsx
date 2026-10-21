import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, vi } from 'vitest'
import { api } from '../../api/client'
import type { PlatformInfo } from '../../api/platforms'
import type { Platform } from '../../api/types'
import { VoicePanel } from './VoicePanel'

vi.mock('../../api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/client')>()),
  api: vi.fn(),
}))

const info = (over: Partial<PlatformInfo> = {}): PlatformInfo => ({
  platform: 'telegram',
  rules: { char_limit: 4096, counting_rule: 'plain', tone_notes: 'Warm', structure_notes: 'Short' },
  effective_limit: 4096,
  stats: {
    post_count: 412,
    thin: false,
    median_length: 320,
    median_lines: 4,
    emoji_share: 0.4,
    hashtag_share: 0.1,
    link_share: 0.2,
    question_share: 0.1,
    ethiopic_share: 0.3,
    top_hashtags: [],
  },
  voice_card: '',
  voice_card_updated_at: null,
  x_premium: null,
  premium_source: null,
  ...over,
})

let current: PlatformInfo
beforeEach(() => {
  vi.clearAllMocks()
  current = info()
  vi.mocked(api).mockImplementation(async (_path, init) => {
    if (init?.method === 'POST') {
      current = {
        ...current,
        voice_card: '- Short posts.',
        voice_card_updated_at: '2026-10-22T09:00:00Z',
      }
    } else if (init?.method === 'PUT') {
      const body = JSON.parse(String(init.body)) as { voice_card?: string; x_premium?: boolean }
      current = {
        ...current,
        ...('voice_card' in body && {
          voice_card: body.voice_card!,
          voice_card_updated_at: '2026-10-22T10:00:00Z',
        }),
        ...('x_premium' in body && {
          x_premium: body.x_premium!,
          premium_source: 'user' as const,
          effective_limit: body.x_premium ? 25000 : 280,
        }),
      }
    }
    return { ...current } as never
  })
})

function renderPanel(platform: Platform = 'telegram', label = 'Telegram') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <VoicePanel platform={platform} label={label} />
    </QueryClientProvider>,
  )
}

test('shows the stats from the posts', async () => {
  renderPanel()
  expect(await screen.findByText('412')).toBeInTheDocument()
  expect(screen.getByText('30%')).toBeInTheDocument() // with Amharic
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
})

test('warns when a platform has fewer than 20 posts (FR-5)', async () => {
  current = info({ stats: { ...info().stats, post_count: 12, thin: true } })
  renderPanel()
  expect(await screen.findByRole('status')).toHaveTextContent('Only 12 Telegram posts')
})

test('writes the card, then saves a hand edit', async () => {
  renderPanel()
  await userEvent.click(await screen.findByRole('button', { name: 'Write from my posts' }))
  const card = await screen.findByDisplayValue('- Short posts.')

  await userEvent.type(card, '\n- Ends with a question.')
  expect(screen.getByRole('button', { name: 'Rewrite from my posts' })).toBeDisabled() // save first
  await userEvent.click(screen.getByRole('button', { name: 'Save voice card' }))

  await vi.waitFor(() =>
    expect(screen.getByLabelText('Voice card')).toHaveValue(
      '- Short posts.\n- Ends with a question.',
    ),
  )
  expect(screen.getByRole('button', { name: 'Save voice card' })).toBeDisabled() // saved
  const put = vi.mocked(api).mock.calls.find((c) => c[1]?.method === 'PUT')
  expect(put?.[0]).toBe('/platforms/telegram/voice-card')
})

test('asks X users about Premium and shows the new limit (Q31)', async () => {
  current = info({
    platform: 'x',
    rules: { ...info().rules, char_limit: 280 },
    effective_limit: 25000,
    x_premium: true,
    premium_source: 'export',
  })
  renderPanel('x', 'X')
  expect(await screen.findByText(/we guessed yes/)).toBeInTheDocument()
  expect(screen.getByLabelText('Yes (up to 25,000)')).toBeChecked()

  await userEvent.click(screen.getByLabelText('No (280)'))
  await vi.waitFor(() => expect(screen.getByLabelText('No (280)')).toBeChecked())
  expect(screen.queryByText(/we guessed yes/)).not.toBeInTheDocument()
})
