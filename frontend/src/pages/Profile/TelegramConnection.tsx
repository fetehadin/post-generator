import { useState } from 'react'
import { usePlatform } from '../../api/platforms'
import { useDisconnectTelegram, useTelegram, useTelegramLink } from '../../api/telegram'
import { Icon } from '../../components/Icon'
import { ghost, primary, secondary } from '../../lib/ui'
import { cn } from '../../lib/utils'
import { ChannelSetting } from './VoicePanel'

/**
 * Profile → Connections → Telegram (FR-36). One button links the account in Telegram; the bot
 * then sends a button that adds it to a channel with the right admin rights. This page checks
 * by itself until the channel shows up. Without the bot (not set up on this server, or the
 * user prefers it), the channel name keeps "Copy and open Telegram" working (FR-12).
 */
export function TelegramConnection() {
  const [waiting, setWaiting] = useState(false)
  const status = useTelegram(waiting)
  const link = useTelegramLink()
  const disconnect = useDisconnectTelegram()
  const manual = usePlatform('telegram')
  const t = status.data
  const channel = t?.channel
  if (waiting && channel) setWaiting(false)

  const handOff = manual.data && <ChannelSetting info={manual.data} />
  if (!t?.enabled) return handOff ?? null

  function connect() {
    // Opened at once (inside the click), then pointed at the link: no pop-up blocker.
    const win = window.open('', '_blank')
    if (win) win.opener = null // the bot's page can't reach back into Voxlace
    link.mutate(undefined, {
      onSuccess: ({ url }) => {
        if (win) win.location.href = url
        else window.location.href = url
        setWaiting(true)
      },
      onError: () => win?.close(),
    })
  }

  const bot = `@${t.bot_username}`
  return (
    <div className="mt-3 flex flex-col gap-3 text-sm">
      {channel ? (
        <div className="flex flex-wrap items-center gap-3 rounded-panel border border-line p-4">
          <Icon name="check" className="size-4 text-thread" />
          <p className="min-w-0 flex-1">
            <span className="font-semibold">Connected to {channel.title}</span>
            {channel.username && <span className="text-muted"> · @{channel.username}</span>}
            <span className="block text-muted">
              {channel.can_post
                ? 'Posts your approved drafts at their time.'
                : `${bot} can't post yet: turn on “Post messages” for it in the channel's admin settings.`}
            </span>
          </p>
          <button
            type="button"
            onClick={() => disconnect.mutate()}
            disabled={disconnect.isPending}
            className={secondary}
          >
            Disconnect
          </button>
        </div>
      ) : (
        <>
          <p className="text-muted">
            The bot posts drafts you approved to your channel, at the time you pick.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {t.linked && t.connect_url ? (
              <a
                href={t.connect_url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setWaiting(true)}
                className={primary}
                data-button
              >
                Add {bot} to your channel ↗
              </a>
            ) : (
              <button type="button" onClick={connect} disabled={link.isPending} className={primary}>
                {link.isPending ? 'Opening Telegram…' : 'Connect Telegram ↗'}
              </button>
            )}
          </div>
          {/* Polite and named: the page says what to do in Telegram, then updates itself. */}
          <p aria-live="polite" className="text-muted">
            {waiting &&
              (t.linked
                ? 'In Telegram: pick your channel and confirm. This page updates by itself.'
                : 'In Telegram: tap Start, then the button the bot sends. This page updates by itself.')}
          </p>
          {link.isError && (
            <p role="alert" className="text-danger">
              {link.error.message}
            </p>
          )}
          {/* The manual way, only once they've tried the button. */}
          {waiting && (
            <p className="text-muted">
              Didn't work? In Telegram, add {bot} as an admin of your channel with “Post messages”
              on. It connects by itself.
            </p>
          )}
        </>
      )}
      {disconnect.isError && (
        <p role="alert" className="text-danger">
          {disconnect.error.message}
        </p>
      )}
      <details className="group">
        <summary className={cn(ghost, 'cursor-pointer list-none px-0')}>
          Or copy and paste yourself: your channel name
        </summary>
        {handOff}
      </details>
    </div>
  )
}
