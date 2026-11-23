import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, vi } from 'vitest'
import type { TelegramStatus } from '../../api/telegram'
import { calls, routeApi } from '../../test/fakeApi'
import { TelegramConnection } from './TelegramConnection'

vi.mock('../../api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/client')>()),
  api: vi.fn(),
}))

const off: TelegramStatus = {
  enabled: false,
  bot_username: null,
  linked: false,
  tg_username: null,
  channel: null,
  connect_url: null,
}
const on: TelegramStatus = {
  ...off,
  enabled: true,
  bot_username: 'VoxlaceBot',
  connect_url: 'https://t.me/VoxlaceBot?startchannel&admin=post_messages',
}
let status: TelegramStatus
beforeEach(() => {
  status = on
  routeApi({
    'GET /telegram': () => status,
    'POST /telegram/link': () => ({ url: 'https://t.me/VoxlaceBot?start=abc' }),
    'DELETE /telegram/channel': () => {
      status = { ...status, channel: null }
      return null
    },
    'GET /platforms/telegram': () => ({ platform: 'telegram', channel: null }),
  })
})
afterEach(() => vi.unstubAllGlobals())

const renderIt = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <TelegramConnection />
    </QueryClientProvider>,
  )

test('without the bot on this server, the channel name keeps copy and open working', async () => {
  status = off
  renderIt()
  expect(await screen.findByLabelText('Your Telegram channel')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Connect Telegram/ })).not.toBeInTheDocument()
})

test('Connect Telegram opens a one-time link to the bot and says what to do there', async () => {
  const tab = { location: { href: '' }, opener: {}, close: vi.fn() }
  vi.stubGlobal(
    'open',
    vi.fn(() => tab),
  )
  renderIt()
  await userEvent.click(await screen.findByRole('button', { name: /Connect Telegram/ }))
  expect(calls()).toContain('POST /telegram/link')
  expect(tab.location.href).toBe('https://t.me/VoxlaceBot?start=abc')
  expect(tab.opener).toBeNull()
  expect(await screen.findByText(/tap Start, then the button the bot sends/)).toBeInTheDocument()
  expect(screen.getByText(/add @VoxlaceBot as an admin of your channel/)).toBeInTheDocument()
})

test('once linked, one tap opens the channel picker with the rights filled in', async () => {
  status = { ...on, linked: true }
  renderIt()
  expect(
    await screen.findByRole('link', { name: /Add @VoxlaceBot to your channel/ }),
  ).toHaveAttribute('href', 'https://t.me/VoxlaceBot?startchannel&admin=post_messages')
})

test('a connected channel shows its name, and can be disconnected', async () => {
  status = {
    ...on,
    linked: true,
    channel: { title: 'FeteScript', username: 'fetescript', can_post: true },
  }
  renderIt()
  expect(await screen.findByText('Connected to FeteScript')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Disconnect' }))
  expect(calls()).toContain('DELETE /telegram/channel')
})

test('without the post right it says exactly what to turn on', async () => {
  status = {
    ...on,
    linked: true,
    channel: { title: 'FeteScript', username: null, can_post: false },
  }
  renderIt()
  expect(await screen.findByText(/turn on “Post messages”/)).toBeInTheDocument()
})
