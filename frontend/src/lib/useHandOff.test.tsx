import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, vi } from 'vitest'
import type { DraftRow } from '../api/types'
import { HandOffPrompt } from '../components/HandOffPrompt'
import { row } from '../test/drafts'
import { calls, routeApi, sent } from '../test/fakeApi'
import { useHandOff } from './useHandOff'

vi.mock('../api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/client')>()),
  api: vi.fn(),
}))

let channel: string | null = null
let bot: { title: string; username: string | null; can_post: boolean } | null = null
const writeText = vi.fn()

beforeEach(() => {
  channel = null
  bot = null
  writeText.mockReset().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  vi.spyOn(window, 'open').mockImplementation(() => null)
  routeApi({
    'GET /platforms/telegram': () => ({ channel }),
    'GET /telegram': () => ({ enabled: true, linked: Boolean(bot), channel: bot }),
    'POST /drafts/:id/publish': () => row({ status: 'published', platform: 'telegram' }),
    'PATCH /drafts/:id': (body) => ({ ...row({ status: 'approved' }), ...(body as object) }),
  })
})

/** The smallest screen that uses the module: the hand-off button, then the question. */
function Harness({ draft }: { draft: DraftRow }) {
  const hand = useHandOff(draft)
  return (
    <>
      {hand.asked ? (
        <HandOffPrompt hand={hand} />
      ) : (
        <>
          <button type="button" onClick={() => void hand.post()}>
            {hand.label}
          </button>
          <button type="button" onClick={() => void hand.copy()}>
            Copy text
          </button>
          {hand.note && <p>{hand.note}</p>}
          {hand.failed && <p role="alert">{hand.failed}</p>}
        </>
      )}
    </>
  )
}

const renderWith = (draft: DraftRow) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Harness draft={draft} />
    </QueryClientProvider>,
  )

test('LinkedIn: copies, opens the composer, then asks and marks it Posted on yes', async () => {
  renderWith(row({ status: 'approved', platform: 'linkedin', text: 'Shipped it' }))
  await userEvent.click(screen.getByRole('button', { name: 'Copy and open LinkedIn' }))
  expect(writeText).toHaveBeenCalledWith('Shipped it')
  expect(window.open).toHaveBeenCalledWith(
    'https://www.linkedin.com/feed/?shareActive=true',
    '_blank',
    'noopener',
  )
  expect(await screen.findByText('Copied.')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Yes, mark as posted' }))
  await vi.waitFor(() => expect(sent('PATCH /drafts/d1')).toEqual([{ status: 'published' }]))
})

test('X opens pre-filled and says nothing about copying', async () => {
  renderWith(row({ status: 'approved', platform: 'x', text: 'hi' }))
  await userEvent.click(screen.getByRole('button', { name: 'Open in X' }))
  expect(writeText).not.toHaveBeenCalled()
  expect(await screen.findByText('Did you post it?')).toBeInTheDocument()
  expect(screen.queryByText('Copied.')).not.toBeInTheDocument()
})

test('Telegram with no channel saved: copies and says where to add the channel', async () => {
  renderWith(row({ status: 'approved', platform: 'telegram' }))
  await userEvent.click(await screen.findByRole('button', { name: 'Copy text for Telegram' }))
  expect(
    await screen.findByText(/Open your channel in Telegram and paste it\. Add the channel name/),
  ).toBeInTheDocument()
})

test('Telegram with a channel: the button opens it', async () => {
  channel = 'fetescript'
  renderWith(row({ status: 'approved', platform: 'telegram' }))
  await userEvent.click(await screen.findByRole('button', { name: 'Copy and open Telegram' }))
  expect(window.open).toHaveBeenCalledWith('https://t.me/fetescript', '_blank', 'noopener')
})

test('a refused copy is an error, and still asks (they can copy by hand)', async () => {
  writeText.mockRejectedValue(new Error('denied'))
  renderWith(row({ status: 'approved', platform: 'linkedin' }))
  await userEvent.click(screen.getByRole('button', { name: 'Copy and open LinkedIn' }))
  expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't copy")
  expect(screen.getByText('Did you post it?')).toBeInTheDocument()
})

test('a draft that is not approved is never handed off (rule 4)', async () => {
  renderWith(row({ status: 'draft', platform: 'linkedin' }))
  await userEvent.click(screen.getByRole('button', { name: 'Copy and open LinkedIn' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Approve this draft')
  expect(window.open).not.toHaveBeenCalled()
  expect(screen.queryByText('Did you post it?')).not.toBeInTheDocument()
})

test('Not yet goes back to the hand-off button without marking anything', async () => {
  renderWith(row({ status: 'approved', platform: 'x' }))
  await userEvent.click(screen.getByRole('button', { name: 'Open in X' }))
  await userEvent.click(await screen.findByRole('button', { name: 'Not yet' }))
  expect(screen.getByRole('button', { name: 'Open in X' })).toBeInTheDocument()
  expect(sent('PATCH /drafts/d1')).toEqual([])
})

test('Copy text copies only, without asking', async () => {
  renderWith(row({ status: 'approved', platform: 'x', text: 'just text' }))
  await userEvent.click(screen.getByRole('button', { name: 'Copy text' }))
  expect(writeText).toHaveBeenCalledWith('just text')
  expect(await screen.findByText('Copied.')).toBeInTheDocument()
  expect(window.open).not.toHaveBeenCalled()
  expect(screen.queryByText('Did you post it?')).not.toBeInTheDocument()
})

test('Telegram with the bot connected: Post to Telegram now, nothing copied, nothing asked (FR-36)', async () => {
  bot = { title: 'Fete builds', username: 'fetebuilds', can_post: true }
  renderWith(row({ status: 'approved', platform: 'telegram', text: 'Shipped it' }))
  await userEvent.click(await screen.findByRole('button', { name: 'Post to Telegram now' }))
  await vi.waitFor(() => expect(calls()).toContain('POST /drafts/d1/publish'))
  expect(await screen.findByText('Posted to Fete builds.')).toBeInTheDocument()
  expect(writeText).not.toHaveBeenCalled()
  expect(window.open).not.toHaveBeenCalled()
  expect(screen.queryByText('Did you post it?')).not.toBeInTheDocument()
})

test('Telegram with the bot but no right to post: still copy and open', async () => {
  bot = { title: 'Fete builds', username: 'fetebuilds', can_post: false }
  channel = 'fetebuilds'
  renderWith(row({ status: 'approved', platform: 'telegram', text: 'Shipped it' }))
  expect(await screen.findByRole('button', { name: /Copy and open/ })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Post to Telegram now' })).not.toBeInTheDocument()
})
