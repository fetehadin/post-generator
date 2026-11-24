import type { GenerateFailure, Platform } from '../api/types'

/** Platforms that failed for the same reason share one line, so it isn't said twice. */
export function sameReason(failures: GenerateFailure[]) {
  const groups: { platforms: Platform[]; code: string; message: string }[] = []
  for (const f of failures) {
    const g = groups.find((x) => x.code === f.code && x.message === f.message)
    if (g) g.platforms.push(f.platform)
    else groups.push({ platforms: [f.platform], code: f.code, message: f.message })
  }
  return groups
}

/** "X", "X and LinkedIn", "X, LinkedIn and Telegram". */
export const joinNames = (names: string[]) =>
  names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
