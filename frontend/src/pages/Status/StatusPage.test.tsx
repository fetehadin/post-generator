import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import { api, ApiError } from '../../api/client'
import { StatusPage } from './StatusPage'

vi.mock('../../api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/client')>()),
  api: vi.fn(),
}))

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <StatusPage />
    </QueryClientProvider>,
  )
}

test('shows API and database as ok', async () => {
  vi.mocked(api).mockResolvedValue({ api: 'ok', db: 'ok' })
  renderPage()
  expect(await screen.findByText('Database')).toBeInTheDocument()
  expect(screen.getAllByText('ok')).toHaveLength(2)
})

test('shows a database problem', async () => {
  vi.mocked(api).mockResolvedValue({ api: 'ok', db: 'error' })
  renderPage()
  expect(await screen.findByText('error')).toBeInTheDocument()
})

test("shows the error's message when the API can't be reached", async () => {
  vi.mocked(api).mockRejectedValue(new ApiError(0, 'network_error', "Can't reach the server."))
  renderPage()
  expect(await screen.findByRole('alert')).toHaveTextContent("Can't reach the server.")
})
