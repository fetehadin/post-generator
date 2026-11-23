import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'
import type { DraftDetail } from './types'

/** docs/API.md, Telegram bot (FR-36). */
export type TelegramStatus = {
  /** The bot is set up on this server. */
  enabled: boolean
  bot_username: string | null
  /** This account is paired with a Telegram account. */
  linked: boolean
  tg_username: string | null
  channel: { title: string; username: string | null; can_post: boolean } | null
  /** Telegram's channel picker with the bot's admin rights already ticked. */
  connect_url: string | null
}

const KEY = ['telegram']

/** While waiting for the user to finish in Telegram, check every few seconds. */
export function useTelegram(waiting = false) {
  return useQuery({
    queryKey: KEY,
    queryFn: () => api<TelegramStatus>('/telegram'),
    refetchInterval: waiting ? 3000 : false,
  })
}

/** POST /telegram/link: a one-time link that pairs this account with the user's Telegram. */
export const useTelegramLink = () =>
  useMutation({ mutationFn: () => api<{ url: string }>('/telegram/link', { method: 'POST' }) })

export function useDisconnectTelegram() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: () => api<null>('/telegram/channel', { method: 'DELETE' }),
    onSuccess: () => void client.invalidateQueries({ queryKey: KEY }),
  })
}

/** POST /drafts/{id}/publish: "Post to Telegram now" (approved drafts only, rule 4). */
export function usePublishDraft() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<DraftDetail>(`/drafts/${id}/publish`, { method: 'POST' }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['threads'] })
      void client.invalidateQueries({ queryKey: ['drafts'] })
      void client.invalidateQueries({ queryKey: ['notifications'] })
    },
  })
}
