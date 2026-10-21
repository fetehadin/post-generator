import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, vi } from 'vitest'
import { ApiError } from '../../api/client'
import type { Platform } from '../../api/types'
import { generated, row } from '../../test/drafts'
import { calls, routeApi, sent } from '../../test/fakeApi'
import { TodayPage } from './TodayPage'

vi.mock('../../api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/client')>()),
  api: vi.fn(),
}))

let card = ''
let drafts: ReturnType<typeof row>[] = []
beforeEach(() => {
  vi.clearAllMocks()
  card = ''
  drafts = []
  routeApi({
    'GET /profile': () => ({ summary_card: card }),
    'GET /drafts': () => ({ items: drafts }),
    'POST /checkins': (b) => ({ id: 'c1', ...(b as object) }),
    'POST /drafts/generate': (b) => {
      const { platform } = b as { platform: Platform }
      if (platform === 'linkedin') throw new ApiError(400, 'no_posts', 'No LinkedIn posts yet.')
      drafts = [...drafts, row({ id: `d-${platform}`, platform })]
      return generated(platform)
    },
  })
})

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <TodayPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const write = (text: string) => userEvent.type(screen.getByLabelText('What you worked on'), text)

test('an empty box without a summary card asks for one', async () => {
  renderPage()
  expect(screen.getByRole('heading', { name: 'What did you do today?' })).toBeInTheDocument()
  expect(await screen.findByRole('link', { name: 'write your summary card' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Generate 1 draft' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Just save' })).toBeDisabled()
})

test('generating saves the check-in, links the drafts to it and lists them', async () => {
  renderPage()
  await write('Finished the importer')
  await userEvent.click(screen.getByRole('button', { name: 'Generate 1 draft' }))

  expect(await screen.findByRole('link', { name: /Small win today/ })).toHaveAttribute(
    'href',
    '/drafts/d-telegram',
  )
  expect(sent('POST /checkins')[0]).toMatchObject({ text: 'Finished the importer' })
  expect(sent('POST /drafts/generate')).toEqual([
    { platform: 'telegram', topic: 'Finished the importer', checkin_id: 'c1' },
  ])
  expect(screen.getByLabelText('What you worked on')).toHaveValue('') // saved, so cleared
  expect(calls().find((c) => c.startsWith('GET /drafts?'))).toContain('created_from=')
})

test('an empty box writes from the summary card, without a check-in', async () => {
  card = 'I build Voxlace.'
  renderPage()
  expect(await screen.findByText(/writes from what Voxlace knows/)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Generate 1 draft' }))
  await screen.findByRole('link', { name: /Small win today/ })
  expect(sent('POST /drafts/generate')).toEqual([{ platform: 'telegram', topic: '' }])
  expect(sent('POST /checkins')).toEqual([])
})

test('"Just save" stores the check-in and generates nothing', async () => {
  renderPage()
  await write('Read about pgvector')
  await userEvent.click(screen.getByRole('button', { name: 'Just save' }))
  expect(await screen.findByText(/Saved to your check-ins/)).toBeInTheDocument()
  expect(sent('POST /checkins')).toHaveLength(1)
  expect(sent('POST /drafts/generate')).toEqual([])
})

test('logo buttons pick platforms; one failing never hides the others, and the text stays', async () => {
  renderPage()
  await userEvent.click(screen.getByRole('button', { name: 'X' }))
  await userEvent.click(screen.getByRole('button', { name: 'LinkedIn' }))
  await write('Shipped')
  await userEvent.click(screen.getByRole('button', { name: 'Generate 3 drafts' }))

  expect(await screen.findByRole('alert')).toHaveTextContent('LinkedIn: No LinkedIn posts yet.')
  expect(screen.getByRole('link', { name: 'Import your LinkedIn posts' })).toBeInTheDocument()
  expect(await screen.findAllByRole('link', { name: /Small win today/ })).toHaveLength(2)
  expect(screen.getByLabelText('What you worked on')).toHaveValue('Shipped')
})
