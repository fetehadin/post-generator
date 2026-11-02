/**
 * Hand-off (FR-12): Voxlace never posts to X or LinkedIn for you. X opens its own composer
 * with the text filled in; LinkedIn can't be pre-filled, so we copy the text and open it.
 */

export function xIntentUrl(text: string): string {
  return `https://x.com/intent/tweet?text=${encodeURIComponent(text)}`
}

export const LINKEDIN_COMPOSER = 'https://www.linkedin.com/feed/?shareActive=true'

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false // no clipboard permission: the caller tells the user to copy by hand
  }
}

/** Telegram has no pre-fill: the text is copied and the user's channel opens (SRS 1.3). */
export const telegramChannelUrl = (channel: string) => `https://t.me/${channel}`

export type HandOffResult = { copied: boolean | null }

/** Where the hand-off opens, or null when nothing can (Telegram with no channel saved). */
export function opensTo(platform: 'x' | 'linkedin' | 'telegram', channel?: string | null) {
  if (platform === 'linkedin') return LINKEDIN_COMPOSER
  if (platform === 'telegram') return channel ? telegramChannelUrl(channel) : null
  return null
}

/** The button text says exactly what happens (DESIGN.md §1, §8). */
export function handOffLabel(platform: 'x' | 'linkedin' | 'telegram', channel?: string | null) {
  if (platform === 'x') return 'Open in X'
  if (platform === 'linkedin') return 'Copy and open LinkedIn'
  return channel ? 'Copy and open Telegram' : 'Copy text for Telegram'
}

/**
 * Copy and open (FR-12). Rule 4: only an approved draft is ever handed off; anything else
 * throws, so a screen can't hand off a draft by mistake. X opens pre-filled (nothing copied);
 * LinkedIn and Telegram get the text copied and the composer or the channel opened.
 */
export async function handOff(
  draft: { platform: 'x' | 'linkedin' | 'telegram'; status: string; text: string },
  channel?: string | null,
): Promise<HandOffResult> {
  if (draft.status !== 'approved') throw new Error('Approve this draft before you post it.')
  if (draft.platform === 'x') {
    window.open(xIntentUrl(draft.text), '_blank', 'noopener')
    return { copied: null }
  }
  // Open before the clipboard await: a tab opened after an await may no longer count as
  // part of the click, and the browser blocks it as a popup.
  const url = opensTo(draft.platform, channel)
  if (url) window.open(url, '_blank', 'noopener')
  return { copied: await copyText(draft.text) }
}
