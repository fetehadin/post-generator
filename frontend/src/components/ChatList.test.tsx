import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, vi } from 'vitest'
import type { ThreadRow } from '../api/types'
import { calls, routeApi, sent } from '../test/fakeApi'
import { ChatList } from './ChatList'

vi.mock('../api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/client')>()),
  api: vi.fn(),
}))

const chat = (id: string, title: string, extra: Partial<ThreadRow> = {}): ThreadRow => ({
  id,
  title,
  platforms: ['x'],
  updated_at: '',
  pinned: false,
  archived: false,
  ...extra,
})

let items: ThreadRow[] = []

beforeEach(() => {
  items = [
    chat('t1', 'Shipped the bot', { pinned: true }),
    chat('t2', 'Importer week'),
    chat('t3', 'Old idea', { archived: true }),
  ]
  routeApi({
    'GET /threads': () => ({ items }),
    'PATCH /threads/:id': (body) => ({ ...items[1], ...(body as object) }),
    'POST /threads/:id/title': () => ({ ...items[1], title: 'Importer done' }),
    'DELETE /threads/:id': () => ({ kept_drafts: 1 }),
  })
})

const renderList = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <ChatList />
      </MemoryRouter>
    </QueryClientProvider>,
  )

const menuFor = async (title: string) => {
  await userEvent.click(await screen.findByRole('button', { name: `More for ${title}` }))
  return screen.findByRole('menu')
}

test('archived chats fold under Archived until opened', async () => {
  renderList()
  expect(await screen.findByRole('link', { name: /Shipped the bot/ })).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Old idea' })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: /Archived/ }))
  expect(screen.getByRole('link', { name: 'Old idea' })).toBeInTheDocument()
})

test('pin, archive and regenerate title from the menu', async () => {
  renderList()
  let menu = await menuFor('Importer week')
  await userEvent.click(within(menu).getByRole('menuitem', { name: 'Pin' }))
  expect(sent('PATCH /threads/t2')).toEqual([{ pinned: true }])

  menu = await menuFor('Importer week')
  await userEvent.click(within(menu).getByRole('menuitem', { name: 'Archive' }))
  expect(sent('PATCH /threads/t2')).toContainEqual({ archived: true })

  menu = await menuFor('Importer week')
  await userEvent.click(within(menu).getByRole('menuitem', { name: 'Regenerate title' }))
  expect(calls()).toContain('POST /threads/t2/title')

  menu = await menuFor('Shipped the bot')
  expect(within(menu).getByRole('menuitem', { name: 'Unpin' })).toBeInTheDocument()
})

test('rename in place: Enter saves, Escape keeps the old name', async () => {
  renderList()
  let menu = await menuFor('Importer week')
  await userEvent.click(within(menu).getByRole('menuitem', { name: 'Rename' }))
  const field = await screen.findByRole('textbox', { name: 'Chat name' })
  await userEvent.clear(field)
  await userEvent.type(field, 'Telegram importer{Enter}')
  expect(sent('PATCH /threads/t2')).toEqual([{ title: 'Telegram importer' }])

  menu = await menuFor('Importer week')
  await userEvent.click(within(menu).getByRole('menuitem', { name: 'Rename' }))
  await userEvent.type(await screen.findByRole('textbox', { name: 'Chat name' }), 'x{Escape}')
  expect(sent('PATCH /threads/t2')).toHaveLength(1)
})

test('delete asks first and says scheduled drafts stay', async () => {
  renderList()
  const menu = await menuFor('Importer week')
  await userEvent.click(within(menu).getByRole('menuitem', { name: 'Delete' }))
  const dialog = await screen.findByRole('dialog')
  expect(dialog).toHaveTextContent('Approved and scheduled drafts stay')
  expect(calls()).not.toContain('DELETE /threads/t2')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Delete chat' }))
  expect(calls()).toContain('DELETE /threads/t2')
})
