import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, vi } from 'vitest'
import type { Checkin } from '../../api/types'
import { routeApi, sent } from '../../test/fakeApi'
import { CheckinsPage } from './CheckinsPage'

vi.mock('../../api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/client')>()),
  api: vi.fn(),
}))

let checkins: Checkin[]
beforeEach(() => {
  checkins = [
    { id: 'c1', day: '2026-10-22', text: 'Fixed the importer', created_at: '', updated_at: 'a' },
  ]
  routeApi({
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

test('past check-ins can be edited, and deleted after a confirmation (FR-6)', async () => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <CheckinsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  expect(await screen.findByText('Fixed the importer')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Edit' }))
  const box = screen.getByLabelText('Check-in text')
  await userEvent.clear(box)
  await userEvent.type(box, 'Fixed the X importer')
  await userEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(await screen.findByText('Fixed the X importer')).toBeInTheDocument()
  expect(sent('PATCH /checkins/c1')).toEqual([{ text: 'Fixed the X importer' }])

  await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
  const dialog = await screen.findByRole('dialog', { name: 'Delete this check-in?' })
  await userEvent.click(within(dialog).getByRole('button', { name: 'Delete check-in' }))
  expect(await screen.findByText(/No check-ins yet/)).toBeInTheDocument()
})
