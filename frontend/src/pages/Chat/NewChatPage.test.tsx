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
beforeEach(() => {
  fail = false
  localStorage.setItem('voxlace-welcomed:u1', '1') // the first-run welcome has its own tests
  routeApi({
    'GET /me': () => ({ id: 'u1', email: 'a@b.c', timezone: 'UTC' }),
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

test('Generate saves the check-in as a new chat and asks which platforms there', async () => {
  renderPage()
  await userEvent.type(screen.getByLabelText('What did you do today?'), 'Fixed the counter')
  await userEvent.click(screen.getByRole('button', { name: 'Generate' }))
  expect(await screen.findByText('at /chat/t9 {"ask":true}')).toBeInTheDocument()
  expect(sent('POST /threads')[0]).toMatchObject({ text: 'Fixed the counter' })
})

test('Save opens the chat without asking; an empty box can do neither', async () => {
  renderPage()
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  await userEvent.click(screen.getByRole('button', { name: 'Today I shipped' }))
  await userEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(await screen.findByText('at /chat/t9 null')).toBeInTheDocument()
})

test('a failure keeps the text where it was (NFR-4)', async () => {
  fail = true
  renderPage()
  const box = screen.getByLabelText('What did you do today?')
  await userEvent.type(box, 'Wrote the docs')
  await userEvent.click(screen.getByRole('button', { name: 'Generate' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('The AI is busy right now.')
  expect(box).toHaveValue('Wrote the docs')
})
