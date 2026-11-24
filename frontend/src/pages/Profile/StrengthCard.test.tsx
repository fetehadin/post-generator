import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { vi } from 'vitest'
import { api } from '../../api/client'
import type { ProfileStrength } from '../../api/me'
import { StrengthCard } from './StrengthCard'

vi.mock('../../api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/client')>()),
  api: vi.fn(),
}))

const item = (id: string, done: boolean, weight: number, tab = 'about') => ({
  id,
  label: `Do ${id}`,
  weight,
  done,
  tab,
  section: `s-${id}`,
})

function renderCard(data: ProfileStrength) {
  vi.mocked(api).mockResolvedValue(data as never)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <StrengthCard />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

test('shows the percentage and links the next step with what it adds', async () => {
  renderCard({
    percent: 35,
    items: [item('profession', true, 10), item('posts', false, 25, 'voice'), item('a', false, 5)],
  })
  expect(await screen.findByText('35%')).toBeInTheDocument()
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '35')
  expect(screen.getByRole('link', { name: 'Do posts' })).toHaveAttribute(
    'href',
    '/profile?tab=voice&section=s-posts',
  )
  expect(screen.getByText('(+25%)')).toBeInTheDocument()
  expect(screen.getByText('1 more to complete your profile')).toBeInTheDocument()
})

test('is hidden at 100%', async () => {
  const { container } = renderCard({ percent: 100, items: [item('profession', true, 100)] })
  await vi.waitFor(() => expect(vi.mocked(api)).toHaveBeenCalled())
  expect(container).toBeEmptyDOMElement()
})
