import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, vi } from 'vitest'
import { ApiError } from '../../api/client'
import { routeApi } from '../../test/fakeApi'
import { GuestPage } from './GuestPage'

vi.mock('../../api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/client')>()),
  api: vi.fn(),
}))

const draft = (platform: string, text: string, receipt: string) => ({
  platform,
  text,
  length: { count: text.length, limit: 280, over: false },
  receipt,
})
let calls: { path: string; body: unknown }[] = []

beforeEach(() => {
  localStorage.clear()
  calls = []
  routeApi({
    'POST /guest/drafts': (body) => {
      calls.push({ path: 'drafts', body })
      return {
        drafts: [draft('x', 'Shipped the fix.', 'r-x')],
        failures: [{ platform: 'linkedin', code: 'ai_unavailable', message: 'The AI is busy.' }],
      }
    },
    'POST /guest/revise': (body) => {
      calls.push({ path: 'revise', body })
      return { draft: draft('x', 'Shipped.', 'r-x2'), question: null }
    },
  })
})

const renderGuest = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <GuestPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )

test('a guest writes drafts, sees a failed platform, and the drafts stay in this browser', async () => {
  renderGuest()
  expect(screen.getByText(/Nothing you write is saved on our server/)).toBeInTheDocument()
  await userEvent.type(screen.getByLabelText('What did you do today?'), 'Fixed sign-up')
  await userEvent.click(screen.getByRole('button', { name: 'Write 2 drafts' }))
  const card = await screen.findByRole('article', { name: 'X draft' })
  expect(within(card).getByText('Shipped the fix.')).toBeInTheDocument()
  expect(within(card).getByText('AI draft')).toBeInTheDocument()
  expect(screen.getByRole('alert')).toHaveTextContent('LinkedIn: The AI is busy.')
  expect(calls[0].body).toEqual({ topic: 'Fixed sign-up', platforms: ['x', 'linkedin'] })
  const kept = JSON.parse(localStorage.getItem('voxlace-guest')!)
  expect(kept.topic).toBe('Fixed sign-up')
  expect(kept.drafts[0].receipt).toBe('r-x')
})

test('a guest can ask for a change; saving, approving and scheduling ask for an account', async () => {
  renderGuest()
  await userEvent.type(screen.getByLabelText('What did you do today?'), 'Fixed sign-up')
  await userEvent.click(screen.getByRole('button', { name: 'Write 2 drafts' }))
  const card = await screen.findByRole('article', { name: 'X draft' })
  await userEvent.click(within(card).getByRole('button', { name: 'Shorter' }))
  expect(await within(card).findByText('Shipped.')).toBeInTheDocument()
  expect(calls[1].body).toEqual({ receipt: 'r-x', instruction: 'Shorter' })
  expect(JSON.parse(localStorage.getItem('voxlace-guest')!).drafts[0].receipt).toBe('r-x2')
  expect(within(card).queryByRole('button', { name: /Send now|Approve/ })).not.toBeInTheDocument()
  expect(
    within(card).getByRole('link', { name: /Save, approve and schedule: create an account/ }),
  ).toHaveAttribute('href', '/login')
})

test('the platform picker needs at least one platform', async () => {
  renderGuest()
  await userEvent.type(screen.getByLabelText('What did you do today?'), 'Hi')
  const group = screen.getByRole('group', { name: 'Write for' })
  await userEvent.click(within(group).getByRole('button', { name: 'X' }))
  await userEvent.click(within(group).getByRole('button', { name: 'LinkedIn' }))
  const send = screen.getByRole('button', { name: 'Write a draft' })
  expect(send).toHaveAttribute('aria-disabled', 'true')
  await userEvent.click(send)
  expect(calls).toHaveLength(0)
})

test('the homepage says what Voxlace does and points to sign-up (FR-50)', () => {
  renderGuest()
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
    'Posts for X, LinkedIn and Telegram, written in your own voice.',
  )
  expect(screen.getByRole('link', { name: 'Start free' })).toHaveAttribute('href', '/login')
  for (const h of ['How it works', 'Where it posts', 'Free to start', 'Questions'])
    expect(screen.getByRole('heading', { name: h })).toBeInTheDocument()
})

test('a role changes the starters and the example; a starter fills the box (FR-50)', async () => {
  renderGuest()
  const example = screen.getByRole('article', { name: 'Example draft' })
  await userEvent.click(screen.getByRole('button', { name: 'Teacher' }))
  expect(screen.getByRole('button', { name: 'Teacher' })).toHaveAttribute('aria-pressed', 'true')
  expect(example).toHaveTextContent(/students explained the lesson/)
  expect(screen.queryByRole('button', { name: 'Today I shipped' })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'A lesson that worked today' }))
  expect(screen.getByLabelText('What did you do today?')).toHaveValue(
    'A lesson that worked today: ',
  )
  expect(screen.getByLabelText('What did you do today?')).toHaveFocus()
})

test('the example leaves once there are real drafts', async () => {
  renderGuest()
  await userEvent.type(screen.getByLabelText('What did you do today?'), 'Fixed sign-up')
  await userEvent.click(screen.getByRole('button', { name: 'Write 2 drafts' }))
  await screen.findByRole('article', { name: 'X draft' })
  expect(screen.queryByRole('article', { name: 'Example draft' })).not.toBeInTheDocument()
})

test('Stop keeps the text and drops a late answer (DESIGN §7)', async () => {
  let finish: (v: unknown) => void = () => {}
  routeApi({
    'POST /guest/drafts': () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  })
  renderGuest()
  await userEvent.type(screen.getByLabelText('What did you do today?'), 'Fixed sign-up')
  await userEvent.click(screen.getByRole('button', { name: 'Write 2 drafts' }))
  expect(await screen.findByTestId('writing-x')).toBeInTheDocument()
  await userEvent.click(screen.getAllByRole('button', { name: 'Stop' })[0])
  expect(screen.queryByTestId('writing-x')).not.toBeInTheDocument()
  finish({ drafts: [draft('x', 'Too late.', 'r-late')], failures: [] })
  await new Promise((r) => setTimeout(r, 0))
  expect(screen.queryByText('Too late.')).not.toBeInTheDocument()
  expect(screen.getByLabelText('What did you do today?')).toHaveValue('Fixed sign-up')
})

test('the guest daily limit is a quiet note with sign-up, not an error', async () => {
  routeApi({
    'POST /guest/drafts': () => {
      throw new ApiError(429, 'guest_limit', "You've used today's free guest drafts.")
    },
  })
  renderGuest()
  await userEvent.type(screen.getByLabelText('What did you do today?'), 'Fixed sign-up')
  await userEvent.click(screen.getByRole('button', { name: 'Write 2 drafts' }))
  expect(await screen.findByText(/Come back tomorrow/)).toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'create a free account' })).toHaveAttribute(
    'href',
    '/login',
  )
})
