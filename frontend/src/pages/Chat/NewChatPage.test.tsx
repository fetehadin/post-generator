import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { beforeEach, vi } from 'vitest'
import { ApiError } from '../../api/client'
import { routeApi, sent } from '../../test/fakeApi'
import { NewChatPage } from './NewChatPage'

vi.mock('../../api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/client')>()),
  api: vi.fn(),
}))

let fail = false
let profession = ''
beforeEach(() => {
  fail = false
  profession = ''
  localStorage.clear()
  localStorage.setItem('voxlace-welcomed:u1', '1') // the first-run welcome has its own tests
  routeApi({
    'GET /me': () => ({ id: 'u1', email: 'a@b.c', timezone: 'UTC' }),
    'GET /profile': () => ({ role: 'x', discipline: profession }),
    'GET /threads': () => ({ items: [] }),
    'POST /threads': () => {
      if (fail) throw new ApiError(429, 'rate_limited', 'The AI is busy right now.')
      return { id: 't9' }
    },
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

const renderPage = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <Routes>
          <Route path="/" element={<NewChatPage />} />
          <Route path="/chat/:id" element={<Where />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )

test('Enter saves the check-in and opens the chat writing the picked platforms', async () => {
  renderPage()
  const box = screen.getByLabelText('What did you do today?')
  await userEvent.click(screen.getByRole('button', { name: 'X' }))
  await userEvent.type(box, 'Fixed the counter{Enter}')
  expect(await screen.findByText('at /chat/t9 {"write":["telegram","x"]}')).toBeInTheDocument()
  expect(sent('POST /threads')[0]).toMatchObject({ text: 'Fixed the counter' })
})

test('Shift+Enter is a new line; an empty box sends nothing', async () => {
  renderPage()
  const box = screen.getByLabelText('What did you do today?')
  await userEvent.type(box, '{Enter}')
  expect(sent('POST /threads')).toEqual([])
  await userEvent.type(box, 'One{Shift>}{Enter}{/Shift}Two')
  expect(box).toHaveValue('One\nTwo')
})

test('Options → Save as a check-in opens the chat without writing', async () => {
  renderPage()
  await userEvent.click(screen.getByRole('button', { name: 'Something I finished today' }))
  await userEvent.click(screen.getByRole('button', { name: 'Options' }))
  await userEvent.click(await screen.findByRole('menuitem', { name: /Save as a check-in/ }))
  expect(await screen.findByText('at /chat/t9 null')).toBeInTheDocument()
})

test('"/" lists commands: /linkedin writes for LinkedIn only', async () => {
  renderPage()
  const box = screen.getByLabelText('What did you do today?')
  await userEvent.type(box, '/link')
  expect(screen.getByRole('option', { name: /linkedin/ })).toBeInTheDocument()
  await userEvent.keyboard('{Enter}')
  expect(box).toHaveValue('')
  expect(screen.getByRole('button', { name: 'LinkedIn' })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByRole('button', { name: 'Telegram' })).toHaveAttribute('aria-pressed', 'false')
})

test('starters follow the profession, so a teacher never sees developer ideas', async () => {
  profession = 'teacher'
  renderPage()
  expect(
    await screen.findByRole('button', { name: 'A lesson that worked today' }),
  ).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Today I shipped' })).not.toBeInTheDocument()
})

test('a failure keeps the text where it was (NFR-4)', async () => {
  fail = true
  renderPage()
  const box = screen.getByLabelText('What did you do today?')
  await userEvent.type(box, 'Wrote the docs{Enter}')
  expect(await screen.findByRole('alert')).toHaveTextContent('The AI is busy right now.')
  expect(box).toHaveValue('Wrote the docs')
})
