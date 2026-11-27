import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useCallback, useState } from 'react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { vi } from 'vitest'
import { routeApi } from '../test/fakeApi'
import { CommandBar, filterItems, useCommandShortcuts } from './CommandBar'

vi.mock('../api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/client')>()),
  api: vi.fn(),
}))

const switchTheme = vi.fn()

function Where() {
  const { pathname, search } = useLocation()
  return <p data-testid="where">{pathname + search}</p>
}

function Harness() {
  const [open, setOpen] = useState(false)
  useCommandShortcuts(useCallback(() => setOpen((o) => !o), []))
  return (
    <>
      <textarea aria-label="Ask for a change" data-composer />
      <CommandBar open={open} onOpenChange={setOpen} onSwitchTheme={switchTheme} />
      <Routes>
        <Route path="*" element={<Where />} />
      </Routes>
    </>
  )
}

function renderBar() {
  routeApi({
    'GET /threads': () => ({
      items: [
        {
          id: 't9',
          title: 'Shipped the importer',
          platforms: ['x'],
          updated_at: '',
          pinned: false,
          archived: false,
        },
      ],
    }),
  })
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/calendar']}>
        <Harness />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

test('Ctrl+K opens the bar; typed words narrow it; Enter goes there (FR-51)', async () => {
  renderBar()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  await userEvent.keyboard('{Control>}k{/Control}')
  const box = await screen.findByRole('combobox', { name: 'Search places and actions' })
  expect(box).toHaveFocus()
  await userEvent.type(box, 'tele dra')
  expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Telegram drafts'])
  await userEvent.keyboard('{Enter}')
  expect(screen.getByTestId('where')).toHaveTextContent('/drafts/telegram')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

test('arrows move through places, Profile tabs and recent chats', async () => {
  renderBar()
  await userEvent.keyboard('{Control>}k{/Control}')
  const box = await screen.findByRole('combobox')
  await userEvent.type(box, 'importer')
  expect(await screen.findByRole('option', { name: /Shipped the importer/ })).toBeInTheDocument()
  await userEvent.clear(box)
  await userEvent.type(box, 'connections')
  await userEvent.keyboard('{Enter}')
  expect(screen.getByTestId('where')).toHaveTextContent('/profile?tab=connections')
})

test('the theme action runs; Esc closes without going anywhere', async () => {
  renderBar()
  await userEvent.keyboard('{Control>}k{/Control}')
  await userEvent.type(await screen.findByRole('combobox'), 'theme{Enter}')
  expect(switchTheme).toHaveBeenCalledOnce()
  await userEvent.keyboard('{Control>}k{/Control}')
  await screen.findByRole('dialog')
  await userEvent.keyboard('{Escape}')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.getByTestId('where')).toHaveTextContent('/calendar')
})

test('Ctrl+J jumps to the message box', async () => {
  renderBar()
  await userEvent.keyboard('{Control>}j{/Control}')
  expect(screen.getByLabelText('Ask for a change')).toHaveFocus()
})

test('every word must match, in any order', () => {
  const items = [
    { label: 'Telegram drafts', group: 'Go to' },
    { label: 'X drafts', group: 'Go to' },
  ]
  expect(filterItems(items, 'drafts tele')).toEqual([items[0]])
  expect(filterItems(items, '  ')).toEqual(items)
  expect(filterItems(items, 'calendar')).toEqual([])
})

test('it opens empty every time, and Ctrl+K works on a non-Latin layout', async () => {
  renderBar()
  await userEvent.keyboard('{Control>}k{/Control}')
  await userEvent.type(await screen.findByRole('combobox'), 'cal{Enter}')
  expect(screen.getByTestId('where')).toHaveTextContent('/calendar')
  // An Amharic layout: the key types "ከ", but it is still the K key.
  fireEvent.keyDown(window, { key: 'ከ', code: 'KeyK', ctrlKey: true })
  expect(await screen.findByRole('combobox')).toHaveValue('')
  expect(screen.getAllByRole('option').length).toBeGreaterThan(5)
})
