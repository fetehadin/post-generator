import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, vi } from 'vitest'
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
  expect(within(card).queryByRole('button', { name: /Open in X|Approve/ })).not.toBeInTheDocument()
  expect(
    within(card).getByRole('link', { name: /Save, approve and schedule: create an account/ }),
  ).toHaveAttribute('href', '/login')
})

test('the platform picker needs at least one platform', async () => {
  renderGuest()
  await userEvent.type(screen.getByLabelText('What did you do today?'), 'Hi')
  const group = screen.getByRole('group', { name: 'Which platforms?' })
  await userEvent.click(within(group).getByRole('button', { name: 'X' }))
  await userEvent.click(within(group).getByRole('button', { name: 'LinkedIn' }))
  expect(screen.getByRole('button', { name: 'Write a draft' })).toBeDisabled()
})
