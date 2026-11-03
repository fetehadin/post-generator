import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useMe } from '../../api/me'
import type { Platform } from '../../api/types'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs'
import { LABEL, PLATFORMS } from '../../lib/platforms'
import { AboutYou } from './AboutYou'
import { AccountSettings } from './AccountSettings'
import { AudiencePanel } from './AudiencePanel'
import { Chip } from './Chip'
import { RemindersPanel } from './RemindersPanel'
import { TimeZoneField } from './TimeZoneField'
import { Uploads } from './Uploads'
import { YourPosts } from './YourPosts'
import { ZoneList } from './ZoneList'

const TABS = [
  { id: 'about', label: 'About you' },
  { id: 'resume', label: 'Resume & portfolio' },
  { id: 'audience', label: 'Audience' },
  { id: 'when', label: 'When you post' },
  { id: 'voice', label: 'Voice & posts' },
  { id: 'account', label: 'Account' },
] as const
type TabId = (typeof TABS)[number]['id']

/**
 * Profile (DESIGN.md §4.4): everything about you, editable, in tabs. The tab lives in the
 * address (`?tab=audience`), so Back works and other screens can link straight to one.
 * Only the open tab is mounted, so each loads its data when you open it.
 */
export function ProfilePage() {
  const me = useMe()
  const [params, setParams] = useSearchParams()
  const tab: TabId = TABS.find((t) => t.id === params.get('tab'))?.id ?? 'about'

  return (
    <div className="mx-auto max-w-[720px] px-4 py-12 md:px-6 md:py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
      {me.data && <p className="mt-1 text-muted">{me.data.email}</p>}

      <Tabs
        value={tab}
        onValueChange={(v) => setParams(v === 'about' ? {} : { tab: v })}
        className="mt-8"
      >
        <TabsList
          variant="line"
          aria-label="Profile sections"
          className="w-full justify-start overflow-x-auto border-b border-line"
        >
          {TABS.map((t) => (
            <TabsTrigger key={t.id} value={t.id} className="flex-none px-3">
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="about">
          <Intro>What Voxlace knows about you. Drafts use the summary card, never guesses.</Intro>
          <ZoneList />
          <TimeZoneField />
          <AboutYou />
        </TabsContent>

        <TabsContent value="resume">
          <Intro>
            Optional. What you check here can go into your summary card, so drafts know your work.
          </Intro>
          <Uploads />
        </TabsContent>

        <TabsContent value="audience">
          <Intro>
            Who reads you on each platform and where they live. When you approve a draft with a day,
            Voxlace picks the hour from this.
          </Intro>
          <ZoneList />
          <PlatformSwitch>{(p) => <AudiencePanel platform={p} label={LABEL[p]} />}</PlatformSwitch>
        </TabsContent>

        <TabsContent value="when">
          <Intro>
            A nudge to check in, so there is something to post about. It shows in the bell; Voxlace
            sends no email.
          </Intro>
          <RemindersPanel />
        </TabsContent>

        <TabsContent value="voice">
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <Intro>Your voice per platform, and the posts it's learned from.</Intro>
            <Link
              to="/import"
              className="inline-flex min-h-10 items-center rounded-control border border-edge px-4 text-sm"
            >
              Import posts
            </Link>
          </div>
          <div className="mt-4">
            <YourPosts />
          </div>
        </TabsContent>

        <TabsContent value="account">
          <AccountSettings />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function Intro({ children }: { children: React.ReactNode }) {
  return <p className="mt-4 text-sm text-muted">{children}</p>
}

/**
 * X · LinkedIn · Telegram above one platform's panel. A panel stays mounted (hidden) once
 * opened, so switching platforms to compare doesn't throw away unsaved edits.
 */
function PlatformSwitch({ children }: { children: (p: Platform) => React.ReactNode }) {
  const [platform, setPlatform] = useState<Platform>('x')
  const [opened, setOpened] = useState<Platform[]>(['x'])
  return (
    <div className="mt-4">
      <div role="group" aria-label="Platform" className="flex flex-wrap gap-2">
        {PLATFORMS.map((p) => (
          <Chip
            key={p}
            on={platform === p}
            onClick={() => {
              setPlatform(p)
              if (!opened.includes(p)) setOpened([...opened, p])
            }}
          >
            {LABEL[p]}
          </Chip>
        ))}
      </div>
      {opened.map((p) => (
        <div key={p} hidden={p !== platform}>
          {children(p)}
        </div>
      ))}
    </div>
  )
}
