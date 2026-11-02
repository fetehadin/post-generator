import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { vi } from 'vitest'
import type { Thread } from '../../api/types'
import { row } from '../../test/drafts'
import { routeApi } from '../../test/fakeApi'
import { ThreadPage } from './ThreadPage'

vi.mock('../../api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/client')>()),
  api: vi.fn(),
}))

const card = (number: number, text: string) => ({
  version_id: `v${number}`,
  number,
  text,
  length: { count: text.length, limit: 280, over: false },
})

const thread: Thread = {
  id: 't1',
  title: 'Finished the importer',
  checkin_id: 'c1',
  checkin_text: 'Finished the importer',
  created_at: '',
  updated_at: '',
  drafts: [row({ id: 'd1', platform: 'x', text: 'Shorter one' })],
  messages: [
    {
      id: 'm1',
      role: 'user',
      text: 'Finished the importer',
      draft_id: null,
      card: null,
      created_at: '',
    },
    {
      id: 'm2',
      role: 'assistant',
      text: '',
      draft_id: 'd1',
      card: card(1, 'First long version\nmore'),
      created_at: '',
    },
    { id: 'm3', role: 'user', text: 'Shorter', draft_id: 'd1', card: null, created_at: '' },
    {
      id: 'm4',
      role: 'assistant',
      text: 'v2: Shorter',
      draft_id: 'd1',
      card: card(2, 'Shorter one'),
      created_at: '',
    },
  ],
}

test('a thread shows the check-in, folds older cards and opens the newest (§4.1)', async () => {
  routeApi({ 'GET /threads/:id': () => thread })
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/chat/t1']}>
        <Routes>
          <Route path="/chat/:id" element={<ThreadPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  expect(await screen.findByRole('heading', { name: 'Finished the importer' })).toBeInTheDocument()
  const open = screen.getByRole('article', { name: 'X draft · v2' })
  expect(open).toHaveTextContent('Shorter one')
  expect(open).toHaveTextContent('AI draft')
  // v1 is folded to its first line, not shown as a full card.
  expect(screen.queryByRole('article', { name: 'X draft · v1' })).not.toBeInTheDocument()
  expect(screen.getByText('First long version')).toBeInTheDocument()
  // The user's reply stays in the stream; the new card itself says v2.
  expect(screen.getByText('Shorter')).toBeInTheDocument()
})
