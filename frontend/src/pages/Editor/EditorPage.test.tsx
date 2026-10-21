import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, vi } from 'vitest'
import type { DraftDetail } from '../../api/types'
import { detail } from '../../test/drafts'
import { routeApi, sent } from '../../test/fakeApi'
import { EditorPage } from './EditorPage'

vi.mock('../../api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/client')>()),
  api: vi.fn(),
}))

let draft: DraftDetail
const version = (text: string, instruction: string) => {
  const n = draft.versions.length + 1
  return { id: `v${n}`, number: n, text, instruction, created_at: `2026-10-22T10:0${n}:00Z` }
}

beforeEach(() => {
  vi.clearAllMocks()
  draft = detail()
  routeApi({
    'GET /me': () => ({ email: 'fete@example.com' }),
    'GET /drafts/:id': () => draft,
    'GET /drafts': () => ({ items: [] }),
    'PATCH /drafts/:id': (b) => {
      const change = b as Partial<DraftDetail>
      if (change.text) {
        const v = version(change.text, 'Edited by hand')
        draft = { ...draft, text: change.text, versions: [...draft.versions, v] }
      }
      draft = { ...draft, ...(change.status && { status: change.status }) }
      if (change.status === 'published') draft = { ...draft, published_at: '2030-05-01T15:05:00Z' }
      if ('scheduled_for' in change) draft = { ...draft, scheduled_for: change.scheduled_for! }
      return draft
    },
    'POST /drafts/:id/revise': (b) => {
      const { instruction } = b as { instruction: string }
      if (instruction === 'mention my project')
        return (draft = {
          ...draft,
          messages: [
            ...draft.messages,
            { id: 'm1', role: 'user', text: instruction, version_id: null, created_at: '' },
            {
              id: 'm2',
              role: 'assistant',
              text: 'Which project?',
              version_id: null,
              created_at: '',
            },
          ],
        })
      const v = version('Shipped. Short.', instruction)
      return (draft = {
        ...draft,
        text: v.text,
        versions: [...draft.versions, v],
        messages: [
          ...draft.messages,
          { id: 'm1', role: 'user', text: instruction, version_id: null, created_at: '' },
          {
            id: 'm2',
            role: 'assistant',
            text: `v2: ${instruction}`,
            version_id: v.id,
            created_at: '',
          },
        ],
      })
    },
  })
})

function renderEditor() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/drafts/d1']}>
        <Routes>
          <Route path="/drafts/:id" element={<EditorPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const textBox = () => screen.findByLabelText('Telegram draft text')

test('shows the draft, its counter, status and the AI tag, and a preview', async () => {
  renderEditor()
  expect(await textBox()).toHaveValue(draft.text)
  expect(screen.getByText('47 / 4,096')).toBeInTheDocument()
  expect(screen.getByText('AI draft')).toBeInTheDocument()
  expect(screen.getByText('Draft', { selector: 'span' })).toBeInTheDocument()
  expect(screen.getByText('Finished the importer')).toBeInTheDocument() // the check-in in the chat
  await userEvent.click(screen.getByRole('button', { name: 'Preview' }))
  expect(screen.getByRole('figure', { name: 'Telegram preview' })).toHaveTextContent('More soon.')
})

test('a hand edit is saved when you leave the text', async () => {
  renderEditor()
  const box = await textBox()
  await userEvent.clear(box)
  await userEvent.type(box, 'My own words.')
  expect(screen.getByRole('button', { name: 'Approve and schedule…' })).toBeDisabled() // save first
  await userEvent.tab()
  expect(await screen.findByRole('button', { name: 'Versions (2)' })).toBeInTheDocument()
  expect(sent('PATCH /drafts/d1')).toEqual([{ text: 'My own words.' }])
})

test('a quick change revises into a new version, shown in the chat', async () => {
  renderEditor()
  await userEvent.click(await screen.findByRole('button', { name: 'Shorter' }))
  await vi.waitFor(async () => expect(await textBox()).toHaveValue('Shipped. Short.'))
  expect(screen.getByText('Shorter', { selector: 'li' })).toBeInTheDocument()
  expect(screen.getByText('Done. v2: Shorter')).toBeInTheDocument()
  expect(sent('POST /drafts/d1/revise')).toEqual([{ instruction: 'Shorter' }])
})

test('a selected part scopes the change', async () => {
  renderEditor()
  const box = (await textBox()) as HTMLTextAreaElement
  box.setSelectionRange(0, 'Small win today'.length)
  fireEvent.select(box)
  expect(await screen.findByText(/Only this part: “Small win today”/)).toBeInTheDocument()
  await userEvent.type(screen.getByLabelText('Tell it what to change'), 'more specific{Enter}')
  await vi.waitFor(() =>
    expect(sent('POST /drafts/d1/revise')).toEqual([
      { instruction: 'more specific', selection: 'Small win today' },
    ]),
  )
})

test('a missing fact gets a question back, not a new version', async () => {
  renderEditor()
  await userEvent.type(
    await screen.findByLabelText('Tell it what to change'),
    'mention my project{Enter}',
  )
  expect(await screen.findByText('Which project?')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Versions (1)' })).toBeInTheDocument()
})

test('approve and schedule sends the chosen local time as UTC', async () => {
  renderEditor()
  await userEvent.click(await screen.findByRole('button', { name: 'Approve and schedule…' }))
  const when = screen.getByLabelText('When (your time)')
  fireEvent.change(when, { target: { value: '2030-05-01T18:00' } })
  await userEvent.click(screen.getByRole('button', { name: 'Approve and schedule' }))

  expect(await screen.findByText(/On your calendar for/)).toBeInTheDocument()
  expect(sent('PATCH /drafts/d1')).toEqual([
    { status: 'approved', scheduled_for: new Date('2030-05-01T18:00').toISOString() },
  ])
})

test('over the limit, approve is disabled and says how much to cut', async () => {
  draft = detail({ length: { count: 4100, limit: 4096, over: true } })
  renderEditor()
  expect(await screen.findByRole('button', { name: 'Approve and schedule…' })).toBeDisabled()
  expect(screen.getByText(/cut 4 characters to approve/)).toBeInTheDocument()
})

test('an approved X post opens X with its text, and "I posted it" marks it posted', async () => {
  draft = detail({ platform: 'x', status: 'approved', scheduled_for: '2030-05-01T15:00:00Z' })
  const open = vi.spyOn(window, 'open').mockReturnValue(null)
  renderEditor()
  await userEvent.click(await screen.findByRole('button', { name: 'Open in X' }))
  expect(String(open.mock.calls[0][0])).toContain('https://x.com/intent/tweet?text=Small')
  await userEvent.click(screen.getByRole('button', { name: 'I posted it' }))
  expect(await screen.findByText('Posted', { selector: 'b' })).toBeInTheDocument()
  expect(screen.getByLabelText('X draft text')).toHaveAttribute('readonly')
})
