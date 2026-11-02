import type { ReactNode } from 'react'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  DialogTrigger,
} from './ui/dialog'

const button =
  'inline-flex min-h-9 items-center rounded-control border border-edge px-3 text-sm hover:bg-sunken disabled:opacity-50'

/**
 * Ask before something that can't be undone (DESIGN.md §8: say what happens). The trigger
 * names the action; the dialog repeats it on a danger button, with a plain way out.
 */
export function ConfirmDialog({
  trigger,
  triggerClassName,
  title,
  description,
  confirm,
  keep = 'Keep it',
  busy = false,
  error,
  onConfirm,
}: {
  trigger: ReactNode
  triggerClassName?: string
  title: string
  description: string
  confirm: string
  keep?: string
  busy?: boolean
  error?: string
  onConfirm: () => void
}) {
  return (
    <Dialog>
      <DialogTrigger className={triggerClassName ?? button}>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <DialogFooter>
          <DialogClose className={button}>{keep}</DialogClose>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="inline-flex min-h-9 items-center rounded-control bg-danger px-3 text-sm font-semibold text-on-primary disabled:opacity-50"
          >
            {confirm}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
