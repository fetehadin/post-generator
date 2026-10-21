import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, vi } from 'vitest'
import type { Checkin } from '../../api/types'
import { row } from '../../test/drafts'
import { calls, routeApi, sent } from '../../test/fakeApi'
import { DraftsPage } from './DraftsPage'

vi.mock('../../api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/client')>()),
  api: vi.fn(),
}))

let checkins: Checkin[]
beforeEach(() => {
  vi.clearAllMocks()
  checkins = [
    { id: 'c1', day: '2026-10-22', text: 'Fixed the importer', created_at: '', updated_at: 'a' },
  ]
  routeApi({
    'GET /drafts': () => ({
      items: [row(), row({ id: 'd2', platform: 'x', status: 'approved', text: 'An X post' })],
    }),
    'GET /checkins': () => ({ items: checkins }),
    'PATCH /checkins/:id': (b) => {
      checkins = [{ ...checkins[0], ...(b as object), updated_at: 'b' }]
      return checkins[0]
    },
    'DELETE /checkins/:id': () => {
      checkins = []
      return null
    },
  })
})

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <DraftsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

test('lists drafts with status, and filters ask the server', async () => {
  renderPage()
  expect(await screen.findByRole('link', { name: /An X post/ })).toHaveTextContent('Approved')
  await userEvent.selectOptions(screen.getByLabelText('Status'), 'approved')
  await userEvent.selectOptions(screen.getByLabelText('Platform'), 'x')
  await vi.waitFor(() => expect(calls().at(-1)).toBe('GET /drafts?status=approved&platform=x'))
})

test('check-ins can be edited and deleted', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  renderPage()
  await userEvent.click(screen.getByRole('tab', { name: 'Check-ins' }))
  expect(await screen.findByText('Fixed the importer')).toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', { name: 'Edit' }))
  const box = screen.getByLabelText('Check-in text')
  await userEvent.clear(box)
  await userEvent.type(box, 'Fixed the X importer')
  await userEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(await screen.findByText('Fixed the X importer')).toBeInTheDocument()
  expect(sent('PATCH /checkins/c1')).toEqual([{ text: 'Fixed the X importer' }])

  await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
  expect(await screen.findByText(/No check-ins yet/)).toBeInTheDocument()
})
