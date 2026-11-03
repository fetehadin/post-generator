import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { beforeEach, vi } from 'vitest'
import { routeApi, sent } from '../../test/fakeApi'
import { NewChatPage } from '../Chat/NewChatPage'
import { WelcomePage } from './WelcomePage'

vi.mock('../../api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/client')>()),
  api: vi.fn(),
}))

let role = ''
beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  role = ''
  routeApi({
    'GET /me': () => ({ id: 'u1', email: 'a@b.c', timezone: 'Africa/Addis_Ababa' }),
    'GET /profile': () => ({ role }),
    'PUT /profile': (b) => ({ role: (b as { role: string }).role }),
    'PUT /platforms/:p/settings': (b) => b,
    'GET /threads': () => ({ items: [] }),
  })
})

function Where() {
  const l = useLocation()
  return (
    <p>
      at {l.pathname} {JSON.stringify(l.state)}
    </p>
  )
}

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/" element={<NewChatPage />} />
          <Route path="/welcome" element={<WelcomePage />} />
          <Route path="/import" element={<Where />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

test('a new account (no role yet) is sent from the new chat to the welcome', async () => {
  renderAt('/')
  expect(await screen.findByText('Where do you post?')).toBeTruthy()
})

test('an account with a role, or one that finished the welcome here, stays on the new chat', async () => {
  role = 'Backend developer'
  renderAt('/')
  expect(await screen.findByText('What did you do today?')).toBeTruthy()
  role = ''
  localStorage.setItem('voxlace-welcomed:u1', '1')
  renderAt('/')
  expect((await screen.findAllByText('What did you do today?')).length).toBe(2)
  expect(screen.queryByText('Where do you post?')).toBeNull()
})

test('platforms → about you → audience from your zone → import', async () => {
  renderAt('/welcome')
  const go = () => userEvent.click(screen.getByRole('button', { name: 'Continue' }))
  await userEvent.click(await screen.findByRole('button', { name: 'X' }))
  await userEvent.click(screen.getByRole('button', { name: 'Telegram' }))
  await go()
  await userEvent.type(screen.getByLabelText('What you do'), 'Backend developer')
  await userEvent.type(screen.getByLabelText(/working on/), 'FastAPI')
  await go()
  expect(sent('PUT /profile')).toEqual([{ role: 'Backend developer', focus: 'FastAPI' }])
  expect(await screen.findByLabelText('Mostly living in the time zone')).toHaveValue(
    'Africa/Addis_Ababa',
  )
  await go()
  await screen.findByText('Teach it your voice')
  const audience = {
    audience_profession: 'developers',
    audience_places: [{ timezone: 'Africa/Addis_Ababa', share: 100 }],
  }
  expect(sent('PUT /platforms/x/settings')).toEqual([audience])
  expect(sent('PUT /platforms/telegram/settings')).toEqual([audience])
  expect(sent('PUT /platforms/linkedin/settings')).toEqual([])
  await userEvent.click(screen.getByRole('button', { name: 'Import my posts' }))
  expect(await screen.findByText(/at \/import/)).toBeTruthy()
  expect(localStorage.getItem('voxlace-welcomed:u1')).toBe('1')
})
