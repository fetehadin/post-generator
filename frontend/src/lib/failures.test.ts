import { joinNames, sameReason } from './failures'

test('platforms that failed for the same reason share one line', () => {
  const busy = { code: 'ai_unavailable', message: 'Drafts are unavailable right now.' }
  const groups = sameReason([
    { platform: 'telegram', ...busy },
    { platform: 'x', code: 'daily_limit', message: 'Limit reached.' },
    { platform: 'linkedin', ...busy },
  ])
  expect(groups).toEqual([
    { platforms: ['telegram', 'linkedin'], ...busy },
    { platforms: ['x'], code: 'daily_limit', message: 'Limit reached.' },
  ])
})

test('names read like a sentence', () => {
  expect(joinNames(['X'])).toBe('X')
  expect(joinNames(['X', 'LinkedIn'])).toBe('X and LinkedIn')
  expect(joinNames(['X', 'LinkedIn', 'Telegram'])).toBe('X, LinkedIn and Telegram')
})
