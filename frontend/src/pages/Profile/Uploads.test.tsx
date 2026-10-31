import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, vi } from 'vitest'
import { ApiError } from '../../api/client'
import type { Upload } from '../../api/uploads'
import { calls, routeApi, sent } from '../../test/fakeApi'
import { removedNote, Uploads } from './Uploads'

vi.mock('../../api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/client')>()),
  api: vi.fn(),
}))

const resume: Upload = {
  id: 'u1',
  kind: 'resume',
  source: 'cv.pdf',
  text: 'Backend developer at Gebeta',
  removed: { emails: 1, phones: 2 },
  reviewed: false,
  created_at: '2026-10-31T10:00:00Z',
  updated_at: '2026-10-31T10:00:00Z',
}

let items: Upload[]
beforeEach(() => {
  vi.clearAllMocks()
  items = [{ ...resume }]
  routeApi({
    'GET /uploads': () => ({ items: items.map((u) => ({ ...u })) }),
    'PATCH /uploads/:id': (body) => {
      items[0] = { ...items[0], ...(body as Partial<Upload>), updated_at: 'later' }
      return items[0]
    },
    'DELETE /uploads/:id': () => {
      items = []
      return null
    },
    'POST /uploads/portfolio': () => {
      throw new ApiError(400, 'invalid_url', "That address isn't a public website.")
    },
  })
})

function renderUploads() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <Uploads />
    </QueryClientProvider>,
  )
}

test('says what was removed, in words', () => {
  expect(removedNote({ emails: 1, phones: 2 })).toBe('Removed 1 email and 2 phone numbers.')
  expect(removedNote({ addresses: 1 })).toBe('Removed 1 address line.')
  expect(removedNote({})).toBe('No contact details found.')
})

test('text is not used until the user marks it checked', async () => {
  renderUploads()
  expect(await screen.findByText('Not used until you check it')).toBeInTheDocument()
  expect(screen.getByText('Removed 1 email and 2 phone numbers.')).toBeInTheDocument()

  await userEvent.click(
    screen.getByRole('button', { name: 'I checked it: use in my summary card' }),
  )
  expect(await screen.findByText('Used when you write your summary card')).toBeInTheDocument()
  expect(sent('PATCH /uploads/u1')).toEqual([{ reviewed: true }])
})

test('edited text must be saved before it can be marked checked', async () => {
  renderUploads()
  const box = await screen.findByLabelText('Resume text')
  await userEvent.type(box, ' since 2023')
  expect(screen.getByRole('button', { name: /I checked it/ })).toBeDisabled()

  await userEvent.click(screen.getByRole('button', { name: 'Save text' }))
  expect(sent('PATCH /uploads/u1')).toEqual([{ text: 'Backend developer at Gebeta since 2023' }])
})

test('delete removes it', async () => {
  renderUploads()
  await userEvent.click(await screen.findByRole('button', { name: 'Delete' }))
  expect(calls()).toContain('DELETE /uploads/u1')
  expect(await screen.findByText(/Rewrite the card under About you/)).toBeInTheDocument()
  expect(await screen.findByLabelText('Portfolio page')).toBeInTheDocument()
  expect(screen.queryByText('cv.pdf')).not.toBeInTheDocument()
})

test('a refused address shows the reason and keeps what was typed', async () => {
  renderUploads()
  const field = await screen.findByLabelText('Portfolio page')
  await userEvent.type(field, 'http://localhost')
  await userEvent.click(screen.getByRole('button', { name: 'Read page' }))
  expect(await screen.findByRole('alert')).toHaveTextContent("isn't a public website")
  expect(field).toHaveValue('http://localhost')
})
