/** Who the user is and who they write for (FR-17, FR-41). Drafts use the words of this field. */
export type AudienceKind = '' | 'peers' | 'clients' | 'employers' | 'public'
export type MainGoal = '' | 'teach' | 'sell' | 'hire' | 'network' | 'announce'

/** Suggestions only: any profession can be typed. */
export const PROFESSION_SUGGESTIONS = [
  'developer',
  'designer',
  'product manager',
  'data scientist',
  'marketer',
  'founder',
  'freelancer',
  'student',
  'teacher',
  'doctor',
  'nurse',
  'lawyer',
  'accountant',
  'recruiter',
  'writer',
  'researcher',
]
export const PROFESSION_LIST_ID = 'voxlace-professions'

export const AUDIENCE_KINDS: Array<[AudienceKind, string]> = [
  ['', 'Not sure yet'],
  ['peers', 'People in my field'],
  ['clients', 'Clients and customers'],
  ['employers', 'Employers and recruiters'],
  ['public', 'Everyone'],
]

export const MAIN_GOALS: Array<[MainGoal, string]> = [
  ['', 'Not sure yet'],
  ['teach', 'Teach what I know'],
  ['sell', 'Show what I offer'],
  ['hire', 'Find people to work with'],
  ['network', 'Meet people'],
  ['announce', 'Share news'],
]
