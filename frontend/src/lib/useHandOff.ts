import { useState } from 'react'
import { usePatchAnyDraft } from '../api/drafts'
import { usePlatform } from '../api/platforms'
import type { DraftRow } from '../api/types'
import { copyText, handOff, handOffLabel } from './handoff'

const COPY_FAILED = "Couldn't copy: select the text and copy it by hand."
const NO_CHANNEL =
  'Copied. Open your channel in Telegram and paste it. Add the channel name in Profile → Connections.'

/**
 * The hand-off of one approved draft (GLOSSARY: Hand-off, Posted; FR-12, rule 4), the one
 * place every screen gets it from: the button text, copy and open, what to tell the user,
 * then "Did you post it?" and Posted on yes. Screens keep only their layout; render the
 * question with <HandOffPrompt hand={…} />.
 *
 * - `post()` hands it off. Not approved: `failed` says so and nothing opens. A refused copy
 *   is `failed` too, but still asks: the user can copy by hand and post.
 * - `copy()` copies the text only, without asking.
 * - `note` is plain news ("Copied."); `failed` is an error; `error` is the Posted request's.
 */
export function useHandOff(draft: DraftRow) {
  const channel = usePlatform('telegram', draft.platform === 'telegram').data?.channel
  const patch = usePatchAnyDraft()
  const [asked, setAsked] = useState(false)
  const [note, setNote] = useState('')
  const [failed, setFailed] = useState('')

  async function post() {
    setNote('')
    setFailed('')
    let copied: boolean | null
    try {
      ;({ copied } = await handOff(draft, channel))
    } catch (e) {
      setFailed((e as Error).message)
      return
    }
    if (copied === false) setFailed(COPY_FAILED)
    else if (copied) setNote(draft.platform === 'telegram' && !channel ? NO_CHANNEL : 'Copied.')
    setAsked(true)
  }

  async function copy() {
    setNote('')
    setFailed('')
    if (await copyText(draft.text)) setNote('Copied.')
    else setFailed(COPY_FAILED)
  }

  return {
    label: handOffLabel(draft.platform, channel),
    post,
    copy,
    asked,
    note,
    failed,
    notYet: () => {
      setAsked(false)
      setNote('')
      setFailed('')
    },
    markPosted: () => patch.mutate({ id: draft.id, status: 'published' }),
    marking: patch.isPending,
    error: patch.error,
  }
}

export type HandOff = ReturnType<typeof useHandOff>
