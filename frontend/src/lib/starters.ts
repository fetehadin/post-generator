/**
 * Idea starters under the empty message box (DESIGN.md §7: "Empty chat"). Picked from the
 * user's profession (FR-17), so a teacher never sees "Today I shipped". Each one starts a
 * sentence the user finishes.
 */
const GROUPS: Array<[RegExp, string[]]> = [
  [
    /develop|engineer|program|coder|software|devops|data sci|machine learning|\bml\b/i,
    ['Today I shipped ', 'A bug I fixed: ', 'Something I learned this week: '],
  ],
  [
    /design|ux|ui\b|illustrat|artist|creative|photograph|video/i,
    [
      'Something I designed today: ',
      'A design decision I made: ',
      'Feedback that changed my work: ',
    ],
  ],
  [
    /teach|lectur|professor|tutor|educat|coach|trainer/i,
    [
      'A lesson that worked today: ',
      'Something a student asked me: ',
      'What I will try next class: ',
    ],
  ],
  [
    /doctor|nurse|medic|health|clinic|pharma|therap|dentist/i,
    [
      'Something I learned on shift: ',
      'A tip I keep giving patients: ',
      'What this week taught me: ',
    ],
  ],
  [
    /market|sales|brand|growth|social media|content|seo/i,
    ['A campaign result this week: ', 'What our customers keep asking: ', 'Something I tested: '],
  ],
  [
    /founder|ceo|startup|business|entrepreneur|owner|freelanc/i,
    ['A win for the business this week: ', 'A hard call I made: ', 'What a customer told me: '],
  ],
  [
    /student|intern|learner/i,
    ['Something I learned today: ', 'A project I am working on: ', 'A mistake that taught me: '],
  ],
  [
    /writ|journal|author|editor|research/i,
    [
      'Something I wrote today: ',
      'An idea I can not stop thinking about: ',
      'What I read this week: ',
    ],
  ],
]

const ANYONE = ['Something I finished today: ', 'A lesson from this week: ', 'A problem I solved: ']

export function startersFor(profession: string | undefined): string[] {
  const p = (profession ?? '').trim()
  if (!p) return ANYONE
  return GROUPS.find(([re]) => re.test(p))?.[1] ?? ANYONE
}

/** "Today I shipped " → "Today I shipped" for the chip's label. */
export const starterLabel = (s: string) => s.replace(/[: ]+$/, '')
