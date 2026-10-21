import { xIntentUrl } from './handoff'

test('the X link carries the exact text, encoded', () => {
  const text = 'Shipped it 🚀\n#buildinpublic & more: https://a.co/x?y=1'
  const url = new URL(xIntentUrl(text))
  expect(url.origin + url.pathname).toBe('https://x.com/intent/tweet')
  expect(url.searchParams.get('text')).toBe(text)
})
