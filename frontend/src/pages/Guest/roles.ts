/**
 * The homepage's role chips (FR-50, DESIGN.md §4.6). A role changes the starter ideas under
 * the box and the example draft beside it, so a teacher sees a teacher's post, not a commit
 * message. Nothing is saved: it's only what the page shows. Every example is labelled
 * "Example" on screen and is never presented as a real user's post.
 */
export type Role = 'developer' | 'designer' | 'teacher' | 'founder' | 'freelancer'

export const ROLES: { id: Role; label: string }[] = [
  { id: 'developer', label: 'Developer' },
  { id: 'designer', label: 'Designer' },
  { id: 'teacher', label: 'Teacher' },
  { id: 'founder', label: 'Founder' },
  { id: 'freelancer', label: 'Freelancer' },
]

/** What the visitor might have typed, and the X draft Voxlace could write from it. */
export type Example = { checkin: string; draft: string }

const ANYONE: Example = {
  checkin: 'Finally finished the thing I had been putting off for a month. Took two hours.',
  draft:
    'Finished something I had been putting off for a month.\n\nIt took two hours. The dread took four weeks.\n\nStarting the hard thing first tomorrow.',
}

const EXAMPLES: Record<Role, Example> = {
  developer: {
    checkin: 'Fixed the bug that only happened on Fridays. Cron job and time zones disagreed.',
    draft:
      'Spent the morning on a bug that only showed up on Fridays.\n\nA cron job and a time zone disagreed about when midnight is.\n\nThe fix was one line. Finding that line took four hours.',
  },
  designer: {
    checkin: 'Cut our sign-up form from 9 fields to 3, the rest is asked later.',
    draft:
      'Redesigned our sign-up form today.\n\nNine fields down to three. The rest is asked later, when people need to give it.\n\nThe best form field is the one you do not show yet.',
  },
  teacher: {
    checkin:
      'Students explained the lesson to each other before I did. Their questions were great.',
    draft:
      'Tried something new in class: students explained the lesson to each other before I did.\n\nTheir questions were better than mine.\n\nKeeping this one.',
  },
  founder: {
    checkin: 'A customer said they almost left in week one. What kept them was our fast reply.',
    draft:
      'A customer told us they almost left in their first week.\n\nWhat kept them was not a feature. It was a reply within the hour.\n\nWriting it down so we keep doing it as we grow.',
  },
  freelancer: {
    checkin: 'Delivered two days early by saying no to one extra request.',
    draft:
      'Delivered a project two days early by saying no to one extra request.\n\nThe client was happier with less, done well, than more, done late.\n\nClear scope is a kindness to both sides.',
  },
}

export const exampleFor = (role: Role | null): Example => (role ? EXAMPLES[role] : ANYONE)
