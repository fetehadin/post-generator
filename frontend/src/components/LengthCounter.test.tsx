import { render, screen } from '@testing-library/react'
import { LengthCounter } from './LengthCounter'

test('shows the count against the limit', () => {
  render(<LengthCounter text="hello" rule="x_weighted" limit={280} />)
  expect(screen.getByText('5 / 280')).toHaveAttribute('data-state', 'ok')
})

test('says how many are left near the limit', () => {
  render(<LengthCounter text={'a'.repeat(260)} rule="x_weighted" limit={280} />)
  expect(screen.getByText('260 / 280 · 20 left')).toHaveAttribute('data-state', 'near')
})

test('says how many to cut when over, counting Amharic as 2 on X', () => {
  render(<LengthCounter text={'ሰ'.repeat(150)} rule="x_weighted" limit={280} />)
  expect(screen.getByText('300 / 280 · cut 20 characters')).toHaveAttribute('data-state', 'over')
})

test('uses plain counting for Telegram', () => {
  render(<LengthCounter text={'ሰ'.repeat(150)} rule="plain" limit={4096} />)
  expect(screen.getByText('150 / 4,096')).toBeInTheDocument()
})
