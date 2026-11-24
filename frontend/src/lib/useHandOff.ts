import { useState } from 'react'
import { usePatchAnyDraft } from '../api/drafts'
import { usePlatform } from '../api/platforms'
import { usePublishDraft, useTelegram } from '../api/telegram'
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
 * - With the Telegram bot connected and allowed to post (FR-36, ADR 0001), a Telegram draft's
 *   `post()` is "Post to Telegram now": the bot sends it on this click and the API marks it
 *   Posted, so nothing is copied and nobody is asked. Without the bot (or without the right
 *   to post), it stays "Copy and open Telegram".
 * - `copy()` copies the text only, without asking.
 * - `note` is plain news ("Copied."); `failed` is an error; `error` is the Posted request's.
 */
export function useHandOff(draft: DraftRow) {
  const telegram = draft.platform === 'telegram'
  const channel = usePlatform('telegram', telegram).data?.channel
  const bot = useTelegram(false, telegram).data?.channel
  const viaBot = telegram && Boolean(bot?.can_post)
  const publish = usePublishDraft()
  const patch = usePatchAnyDraft()
  const [asked, setAsked] = useState(false)
  const [note, setNote] = useState('')
  const [failed, setFailed] = useState('')

  async function post() {
    setNote('')
    setFailed('')
    if (viaBot) {
      if (publish.isPending) return
      try {
        await publish.mutateAsync(draft.id)
        setNote(`Posted to ${bot?.title}.`)
      } catch (e) {
        setFailed((e as Error).message)
      }
      return
    }
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
    label: viaBot ? 'Post to Telegram now' : handOffLabel(draft.platform, channel),
    /** The bot posts this one (Telegram, connected, allowed to post). */
    viaBot,
    /** The connected channel's name, when the bot posts it. */
    botChannel: viaBot ? bot?.title : undefined,
    posting: publish.isPending,
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
