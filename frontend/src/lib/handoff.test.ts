import { handOff, handOffLabel, xIntentUrl } from './handoff'

test('the X link carries the exact text, encoded', () => {
  const text = 'Shipped it 🚀\n#buildinpublic & more: https://a.co/x?y=1'
  const url = new URL(xIntentUrl(text))
  expect(url.origin + url.pathname).toBe('https://x.com/intent/tweet')
  expect(url.searchParams.get('text')).toBe(text)
})

test('handOff refuses a draft that is not approved (rule 4)', async () => {
  const open = vi.spyOn(window, 'open').mockReturnValue(null)
  await expect(handOff({ platform: 'x', status: 'draft', text: 'hi' })).rejects.toThrow(
    /Approve this draft/,
  )
  expect(open).not.toHaveBeenCalled()
  open.mockRestore()
})

test('handOff copies Telegram text and opens the saved channel', async () => {
  const open = vi.spyOn(window, 'open').mockReturnValue(null)
  const write = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: write }, configurable: true })
  const r = await handOff(
    { platform: 'telegram', status: 'approved', text: 'Shipped' },
    'fetescript',
  )
  expect(write).toHaveBeenCalledWith('Shipped')
  expect(open).toHaveBeenCalledWith('https://t.me/fetescript', '_blank', 'noopener')
  expect(r.copied).toBe(true)
  open.mockRestore()
})

test('a posted draft is not handed off again, and Telegram without a channel only copies', async () => {
  await expect(handOff({ platform: 'x', status: 'published', text: 'hi' })).rejects.toThrow()
  expect(handOffLabel('telegram', null)).toBe('Copy text for Telegram')
  expect(handOffLabel('telegram', 'fetescript')).toBe('Copy and open Telegram')
  expect(handOffLabel('linkedin')).toBe('Copy and open LinkedIn')
})
