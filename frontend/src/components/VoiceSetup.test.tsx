import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, vi } from 'vitest'
import { routeApi, sent } from '../test/fakeApi'
import { VoiceSetup } from './VoiceSetup'

vi.mock('../api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/client')>()),
  api: vi.fn(),
}))

let role = ''
beforeEach(() => {
  localStorage.clear()
  role = ''
  routeApi({
    'GET /profile': () => ({ role, discipline: '' }),
    'PUT /profile': (b) => ({ role: 'Teacher', discipline: 'teacher', ...(b as object) }),
  })
})

const renderCard = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <VoiceSetup />
      </MemoryRouter>
    </QueryClientProvider>,
  )

test('one tap saves what you do; it is optional and never asked twice', async () => {
  renderCard()
  await userEvent.click(await screen.findByRole('button', { name: 'Teacher' }))
  expect(sent('PUT /profile')).toEqual([{ discipline: 'teacher', role: 'Teacher' }])
  await userEvent.click(screen.getByRole('button', { name: 'Teach what I know' }))
  expect(sent('PUT /profile').at(-1)).toEqual({ main_goal: 'teach' })
  expect(screen.getByText('Thanks. Your next drafts use this.')).toBeInTheDocument()
})

test('"Not now" hides it for a week', async () => {
  renderCard()
  await userEvent.click(await screen.findByRole('button', { name: 'Not now' }))
  expect(screen.queryByText('What do you do?')).not.toBeInTheDocument()
  expect(Number(localStorage.getItem('voxlace.snooze.voice-setup'))).toBeGreaterThan(Date.now())
})

test('someone who already said what they do never sees it', async () => {
  role = 'Designer'
  renderCard()
  await new Promise((r) => setTimeout(r, 50))
  expect(screen.queryByText('What do you do?')).not.toBeInTheDocument()
})
