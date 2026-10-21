import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, vi } from 'vitest'
import { api, ApiError } from '../../api/client'
import type { ImportJob } from '../../api/types'
import { UploadPage } from './UploadPage'

vi.mock('../../api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/client')>()),
  api: vi.fn(),
}))

beforeEach(() => vi.clearAllMocks())

const job = (over: Partial<ImportJob> = {}): ImportJob => ({
  id: 'j1',
  platform: 'telegram',
  status: 'embedding',
  parsed: 412,
  skipped: { forwarded: 135, service: 21 },
  embedded: 120,
  waiting: 292,
  ...over,
})

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <UploadPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const exportFile = (bytes = 10) =>
  new File(['x'.repeat(bytes)], 'result.json', { type: 'application/json' })

test('Import is disabled until a file is chosen, then uploads it as Telegram', async () => {
  vi.mocked(api).mockResolvedValueOnce(job()).mockResolvedValue(job())
  renderPage()
  const button = screen.getByRole('button', { name: 'Import posts' })
  expect(button).toBeDisabled()

  await userEvent.upload(screen.getByLabelText(/Choose result.json/), exportFile())
  await userEvent.click(button)

  const [path, init] = vi.mocked(api).mock.calls[0]
  const body = init?.body as FormData
  expect(path).toBe('/imports')
  expect(body.get('platform')).toBe('telegram')
  expect((body.get('file') as File).name).toBe('result.json')
})

test('shows what was found, why messages were skipped, and the learning progress', async () => {
  vi.mocked(api).mockResolvedValue(job())
  renderPage()
  await userEvent.upload(screen.getByLabelText(/Choose result.json/), exportFile())
  await userEvent.click(screen.getByRole('button', { name: 'Import posts' }))

  expect(await screen.findByRole('heading', { name: '412 posts found' })).toBeInTheDocument()
  expect(screen.getByText('156 messages skipped')).toBeInTheDocument()
  expect(screen.getByText('135 forwarded from other channels')).toBeInTheDocument()
  expect(screen.getByLabelText(/Learning your voice… 120 of 412/)).toBeInTheDocument()
})

test('says the voice is ready when learning is done', async () => {
  vi.mocked(api).mockResolvedValue(job({ status: 'done', embedded: 412, waiting: 0 }))
  renderPage()
  await userEvent.upload(screen.getByLabelText(/Choose result.json/), exportFile())
  await userEvent.click(screen.getByRole('button', { name: 'Import posts' }))
  expect(await screen.findByText('Your voice is ready.')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Write your first post' })).toHaveAttribute('href', '/')
})

test("shows the server's message for a wrong file and keeps the file", async () => {
  vi.mocked(api).mockRejectedValue(
    new ApiError(400, 'invalid_file', "This isn't a Telegram export. Export your channel as JSON."),
  )
  renderPage()
  await userEvent.upload(screen.getByLabelText(/Choose result.json/), exportFile())
  await userEvent.click(screen.getByRole('button', { name: 'Import posts' }))
  expect(await screen.findByRole('alert')).toHaveTextContent("This isn't a Telegram export.")
  expect(screen.getByText('result.json')).toBeInTheDocument()
})

test('refuses a file over 64 MB before uploading', async () => {
  renderPage()
  const big = exportFile()
  Object.defineProperty(big, 'size', { value: 65 * 1024 * 1024 })
  await userEvent.upload(screen.getByLabelText(/Choose result.json/), big)
  expect(screen.getByRole('alert')).toHaveTextContent('larger than 64 MB')
  expect(screen.getByRole('button', { name: 'Import posts' })).toBeDisabled()
  expect(api).not.toHaveBeenCalled()
})

test('a re-import says nothing was added twice, without counting it as skipped', async () => {
  vi.mocked(api).mockResolvedValue(
    job({
      status: 'done',
      skipped: { forwarded: 135, already_imported: 412 },
      embedded: 412,
      waiting: 0,
    }),
  )
  renderPage()
  await userEvent.upload(screen.getByLabelText(/Choose result.json/), exportFile())
  await userEvent.click(screen.getByRole('button', { name: 'Import posts' }))
  expect(await screen.findByText(/All of them were already imported/)).toBeInTheDocument()
  expect(screen.getByText('135 messages skipped')).toBeInTheDocument()
})

test('X: choose X, upload the archive ZIP, and see the Premium note', async () => {
  vi.mocked(api).mockResolvedValue(
    job({ platform: 'x', parsed: 72, skipped: { reply: 225, repost: 3 }, premium_hint: true }),
  )
  renderPage()
  await userEvent.click(screen.getByRole('radio', { name: 'X' }))
  expect(screen.getByText(/Download an archive of your data/)).toBeInTheDocument()
  const zip = new File(['PK'], 'twitter-archive.zip', { type: 'application/zip' })
  await userEvent.upload(screen.getByLabelText(/Choose your X archive/), zip)
  await userEvent.click(screen.getByRole('button', { name: 'Import posts' }))

  expect((vi.mocked(api).mock.calls[0][1]?.body as FormData).get('platform')).toBe('x')
  expect(await screen.findByRole('heading', { name: '72 posts found' })).toBeInTheDocument()
  expect(screen.getByText('225 replies to other people')).toBeInTheDocument()
  expect(screen.getByText(/probably has\s+Premium/)).toBeInTheDocument()
})

test('LinkedIn: the how-to says to request the larger archive', async () => {
  renderPage()
  await userEvent.click(screen.getByRole('radio', { name: 'LinkedIn' }))
  expect(screen.getByText(/The small one has no posts/)).toBeInTheDocument()
  expect(screen.getByLabelText(/Choose your LinkedIn export/)).toHaveAttribute(
    'accept',
    expect.stringContaining('.csv'),
  )
})
