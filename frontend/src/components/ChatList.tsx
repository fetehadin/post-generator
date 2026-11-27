import { useRef, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router'
import type { ThreadRow } from '../api/types'
import { useDeleteThread, useRetitleThread, useThreads, useUpdateThread } from '../api/threads'
import { cn } from '../lib/utils'
import { ConfirmDialog } from './ConfirmDialog'
import { Icon } from './Icon'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'
import { Tooltip } from './ui/tooltip'

const iconButton =
  'flex size-8 flex-none items-center justify-center rounded-control text-muted hover:bg-sunken hover:text-ink'

/**
 * The sidebar's chat history (FR-46, FR-55; DESIGN.md §2): pinned first, then newest first.
 * Each row has a "⋯" menu (Rename, Regenerate title, Pin, Archive, Delete); archived chats
 * fold under "Archived" at the end. Scrolls on its own.
 */
export function ChatList() {
  const list = useThreads()
  const items = list.data?.items ?? []
  const active = items.filter((t) => !t.archived)
  const archived = items.filter((t) => t.archived)
  const [showArchived, setShowArchived] = useState(false)

  return (
    <section aria-labelledby="chats-title" className="flex min-h-0 flex-col">
      <div className="flex items-center gap-1 pt-4 pr-1 pb-1 pl-2.5">
        <h2 id="chats-title" className="flex-1 text-xs font-semibold text-muted">
          Chats
        </h2>
        <Tooltip content="Refresh chats">
          <button
            type="button"
            aria-label="Refresh chats"
            onClick={() => void list.refetch()}
            className={cn(iconButton, 'size-7', list.isFetching && 'animate-spin')}
          >
            <Icon name="refresh" className="size-4" />
          </button>
        </Tooltip>
        <Tooltip content="New chat">
          <NavLink to="/" aria-label="Start a new chat" className={cn(iconButton, 'size-7')}>
            <Icon name="plus" className="size-4" />
          </NavLink>
        </Tooltip>
      </div>
      {items.length === 0 ? (
        <p className="px-2.5 text-sm text-muted">Your chats will appear here.</p>
      ) : (
        <div className="max-h-[40vh] min-h-0 overflow-y-auto">
          <ul>
            {active.map((t) => (
              <ChatRow key={t.id} chat={t} />
            ))}
          </ul>
          {archived.length > 0 && (
            <>
              <button
                type="button"
                aria-expanded={showArchived}
                aria-controls="archived-chats"
                onClick={() => setShowArchived(!showArchived)}
                className="mt-1 flex min-h-9 w-full items-center gap-2 rounded-control px-2.5 text-sm text-muted hover:bg-sunken"
              >
                <Icon
                  name="chevron-right"
                  className={cn('size-4 transition-transform', showArchived && 'rotate-90')}
                />
                <Icon name="archive" className="size-4" />
                Archived
                <span className="ml-auto tabular-nums">{archived.length}</span>
              </button>
              {showArchived && (
                <ul id="archived-chats">
                  {archived.map((t) => (
                    <ChatRow key={t.id} chat={t} />
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}
    </section>
  )
}

function ChatRow({ chat }: { chat: ThreadRow }) {
  const update = useUpdateThread()
  const retitle = useRetitleThread()
  const remove = useDeleteThread()
  const navigate = useNavigate()
  const here = useLocation().pathname === `/chat/${chat.id}`
  const [renaming, setRenaming] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const error = update.error ?? retitle.error

  if (renaming)
    return (
      <li className="px-1">
        <RenameField
          initial={chat.title}
          onDone={(title) => {
            setRenaming(false)
            if (title && title !== chat.title) update.mutate({ id: chat.id, title })
          }}
        />
      </li>
    )

  return (
    <li className="group relative">
      <Tooltip content={chat.title} side="right">
        <span className="block">
          <NavLink
            to={`/chat/${chat.id}`}
            className={({ isActive }) =>
              cn(
                'flex min-h-9 items-center gap-1.5 rounded-control py-2 pr-9 pl-2.5 text-sm',
                isActive ? 'bg-sunken' : 'hover:bg-sunken',
              )
            }
          >
            {chat.pinned && !chat.archived && (
              <Icon name="pin" className="size-3.5 flex-none text-muted" />
            )}
            <span className="truncate">{retitle.isPending ? 'Naming…' : chat.title}</span>
          </NavLink>
        </span>
      </Tooltip>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`More for ${chat.title}`}
          className={cn(
            iconButton,
            'absolute top-0.5 right-0.5 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100',
          )}
        >
          <Icon name="more" className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="right" className="min-w-48">
          <DropdownMenuItem onSelect={() => setRenaming(true)}>
            <Icon name="pencil" className="size-4" />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem disabled={retitle.isPending} onSelect={() => retitle.mutate(chat.id)}>
            <Icon name="sparkle" className="size-4" />
            Regenerate title
          </DropdownMenuItem>
          {!chat.archived && (
            <DropdownMenuItem onSelect={() => update.mutate({ id: chat.id, pinned: !chat.pinned })}>
              <Icon name="pin" className="size-4" />
              {chat.pinned ? 'Unpin' : 'Pin'}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onSelect={() => update.mutate({ id: chat.id, archived: !chat.archived })}
          >
            <Icon name="archive" className="size-4" />
            {chat.archived ? 'Unarchive' : 'Archive'}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirming(true)}>
            <Icon name="trash" className="size-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Delete this chat?"
        description={`“${chat.title}” and its unapproved drafts are deleted. Approved and scheduled drafts stay in Drafts and the Calendar.`}
        confirm="Delete chat"
        keep="Keep it"
        busy={remove.isPending}
        error={remove.error?.message}
        onConfirm={() =>
          remove.mutate(chat.id, {
            onSuccess: () => {
              setConfirming(false)
              if (here) navigate('/')
            },
          })
        }
      />
      {error && (
        <p role="alert" className="px-2.5 pb-1 text-xs text-danger">
          {error.message}
        </p>
      )}
    </li>
  )
}

/** Rename in place: Enter or leaving the field saves, Escape keeps the old name. */
function RenameField({ initial, onDone }: { initial: string; onDone: (title: string) => void }) {
  const [value, setValue] = useState(initial)
  const done = useRef(false) // Escape closes the field; the blur that may follow must not save
  const finish = (title: string) => {
    if (done.current) return
    done.current = true
    onDone(title)
  }
  return (
    <input
      aria-label="Chat name"
      autoFocus
      value={value}
      maxLength={120}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => finish(value.trim())}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') finish(initial)
      }}
      className="min-h-9 w-full rounded-control border border-thread bg-surface px-2 text-sm"
    />
  )
}
