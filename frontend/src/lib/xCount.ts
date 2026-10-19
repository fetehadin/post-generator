/**
 * X weighted length (twitter-text v3 rules), the same as backend/app/counting.py.
 * Both sides are tested against samples/x_counter_cases.json. Never use text.length for X.
 */

const URL = /https?:\/\/\S+/g
const URL_WEIGHT = 23
const ZWJ = 0x200d

// Characters in these ranges weigh 1; everything else (Amharic, CJK, emoji…) weighs 2.
const LIGHT_RANGES: Array<[number, number]> = [
  [0x0000, 0x10ff],
  [0x2000, 0x200d],
  [0x2010, 0x201f],
  [0x2032, 0x2037],
]

const isLight = (cp: number) => LIGHT_RANGES.some(([lo, hi]) => cp >= lo && cp <= hi)

/** Parts that belong to the emoji before them and add nothing. */
const isEmojiPart = (cp: number) =>
  cp === 0xfe0f ||
  (cp >= 0x1f3fb && cp <= 0x1f3ff) ||
  (cp >= 0xe0020 && cp <= 0xe007f) ||
  cp === 0x20e3

const isRegional = (cp: number) => cp >= 0x1f1e6 && cp <= 0x1f1ff

export function xWeightedLength(text: string): number {
  let total = URL_WEIGHT * (text.match(URL)?.length ?? 0)
  let joined = false
  let flagOpen = false
  for (const ch of text.replace(URL, '')) {
    const cp = ch.codePointAt(0)!
    if (cp === ZWJ) {
      joined = true
      continue
    }
    if (isEmojiPart(cp)) continue
    if (joined) {
      joined = false
      continue
    }
    if (isRegional(cp)) {
      flagOpen = !flagOpen
      total += flagOpen ? 2 : 0
      continue
    }
    flagOpen = false
    total += isLight(cp) ? 1 : 2
  }
  return total
}

export type CountingRule = 'x_weighted' | 'plain'

/** Length by the platform's counting rule (the API sends the rule with each draft). */
export function postLength(text: string, rule: CountingRule): number {
  return rule === 'x_weighted' ? xWeightedLength(text) : [...text].length
}
