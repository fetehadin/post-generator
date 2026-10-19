import fixture from '../../../samples/x_counter_cases.json'
import { postLength, xWeightedLength } from './xCount'

describe('X weighted length (same cases as the backend)', () => {
  test.each(fixture.cases)('$why', ({ text, expected }) => {
    expect(xWeightedLength(text)).toBe(expected)
  })
})

test('plain counting counts characters, not UTF-16 units', () => {
  expect(postLength('ሰላም 👋', 'plain')).toBe(5)
  expect(postLength('ሰላም 👋', 'x_weighted')).toBe(3 * 2 + 1 + 2)
})
