import { useState } from 'react'
import { usePatchAnyDraft } from '../api/drafts'
import { usePlatform } from '../api/platforms'
import type { DraftRow } from '../api/types'
import { handOff, handOffLabel } from './handoff'

/**
 * "Post now" for one approved draft (FR-12, rule 4): copy and open the platform, then ask
 * "Did you post it?" and mark it Posted on yes. One place for the calendar, the
 * notifications panel and anything else that offers it.
 */
export function usePostNow(draft: DraftRow) {
  const channel = usePlatform('telegram', draft.platform === 'telegram').data?.channel
  const patch = usePatchAnyDraft()
  const [asked, setAsked] = useState(false)
  const [note, setNote] = useState('')

  async function post() {
    let copied: boolean | null
    try {
      ;({ copied } = await handOff(draft, channel))
    } catch (e) {
      setNote((e as Error).message)
      return
    }
    setNote(
      copied === false
        ? "Couldn't copy: select the text in the draft and copy it by hand."
        : draft.platform === 'telegram' && !channel
          ? 'Copied. Open your channel in Telegram and paste it. Add the channel name in Profile.'
          : copied
            ? 'Copied.'
            : '',
    )
    setAsked(true)
  }

  return {
    label: handOffLabel(draft.platform, channel),
    post,
    asked,
    note,
    notYet: () => setAsked(false),
    markPosted: () => patch.mutate({ id: draft.id, status: 'published' }),
    patch,
  }
}
