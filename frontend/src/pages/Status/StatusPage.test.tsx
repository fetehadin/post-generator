import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { afterEach, vi } from 'vitest'
import { StatusPage } from './StatusPage'

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <StatusPage />
    </QueryClientProvider>,
  )
}

function answer(status: number, body: unknown) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status })))
}

afterEach(() => vi.unstubAllGlobals())

test('shows API and database as ok', async () => {
  answer(200, { api: 'ok', db: 'ok' })
  renderPage()
  expect(await screen.findByText('API')).toBeInTheDocument()
  expect(screen.getAllByText('ok')).toHaveLength(2)
})

test("shows the server's error message, not a stack trace", async () => {
  answer(503, { error: { code: 'db_unavailable', message: 'The database is not reachable.' } })
  renderPage()
  expect(await screen.findByRole('alert')).toHaveTextContent('The database is not reachable.')
})

test('explains a network failure in plain words', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
  renderPage()
  expect(await screen.findByRole('alert')).toHaveTextContent("Can't reach the server")
})
