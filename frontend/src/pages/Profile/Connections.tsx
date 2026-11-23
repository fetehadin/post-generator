import { usePlatform } from '../../api/platforms'
import { useProfile } from '../../api/profile'
import { AIKeys } from './AIKeys'
import { GitHubPanel } from './GitHubPanel'
import { ChannelSetting } from './VoicePanel'

/** A developer profession: GitHub ideas are offered up front only to them (DESIGN.md §4.4). */
const DEVELOPER = /develop|engineer|program|software|devops|data sci|coder/i

/**
 * Profile → Connections (DESIGN.md §4.4, 21 Nov 2026): everything optional you can connect,
 * in one place, none of it needed to write a draft. A free AI key (FR-48), the Telegram
 * channel the hand-off opens (FR-12), and GitHub ideas (FR-14), folded away unless you
 * said you're a developer.
 */
export function Connections() {
  const telegram = usePlatform('telegram')
  const developer = DEVELOPER.test(useProfile().data?.discipline ?? '')
  return (
    <div className="mt-4 flex flex-col gap-8">
      <section id="free-key" aria-labelledby="free-key-title" className="scroll-mt-6">
        <h2 id="free-key-title" className="font-semibold">
          Free AI key
        </h2>
        <AIKeys />
      </section>

      <section id="telegram" aria-labelledby="telegram-title" className="scroll-mt-6">
        <h2 id="telegram-title" className="font-semibold">
          Telegram channel
        </h2>
        {telegram.data && <ChannelSetting info={telegram.data} />}
      </section>

      <details
        id="github"
        open={developer}
        className="group scroll-mt-6 rounded-panel border border-line px-4 py-1 open:pb-4"
      >
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 font-semibold">
          <span
            aria-hidden="true"
            className="transition-transform duration-(--duration) group-open:rotate-90"
          >
            ›
          </span>
          GitHub
          <span className="ml-auto text-sm font-normal text-muted">For developers</span>
        </summary>
        <p className="mt-1 text-sm text-muted">
          Post ideas from the work you push, suggested in the evening as drafts you edit and
          approve.
        </p>
        <GitHubPanel />
      </details>
    </div>
  )
}
