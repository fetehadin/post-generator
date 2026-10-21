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
