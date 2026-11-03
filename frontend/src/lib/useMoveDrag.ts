import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react'

/**
 * Drag a calendar post to another slot with a mouse, a pen or a finger (DESIGN.md §4.3).
 * The browser's own drag-and-drop doesn't work with touch, so this uses pointer events:
 * the post follows the pointer, and on release the slot under it (an element with
 * `data-drop-day`, and `data-drop-hour` in the time grids) receives it. A mouse can drag the
 * whole post; touch drags start from the grip, so swiping the grid still scrolls it.
 * "Move to…" stays as the way that needs no dragging at all (WCAG 2.5.7).
 */
export type DropTarget = { day: string; hour?: number }

const THRESHOLD = 6 // px of movement before a press becomes a drag

type Drag = { id: string; el: HTMLElement; x: number; y: number; moving: boolean }

export function targetAt(x: number, y: number): DropTarget | null {
  const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-drop-day]')
  if (!el) return null
  const hour = el.dataset.dropHour
  return { day: el.dataset.dropDay!, hour: hour === undefined ? undefined : Number(hour) }
}

export function useMoveDrag(onDrop: (id: string, target: DropTarget) => void) {
  const drag = useRef<Drag | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null) // "day" or "day@hour"

  const end = useCallback(() => {
    const d = drag.current
    if (d) d.el.style.transform = ''
    drag.current = null
    setDragging(null)
    setOver(null)
  }, [])

  useEffect(() => {
    function move(e: globalThis.PointerEvent) {
      const d = drag.current
      if (!d) return
      const dx = e.clientX - d.x
      const dy = e.clientY - d.y
      if (!d.moving && Math.hypot(dx, dy) < THRESHOLD) return
      if (!d.moving) {
        d.moving = true
        setDragging(d.id)
      }
      e.preventDefault()
      d.el.style.transform = `translate(${dx}px, ${dy}px)` // a dynamic value: inline is fine
      const t = targetAt(e.clientX, e.clientY)
      setOver(t ? `${t.day}${t.hour === undefined ? '' : `@${t.hour}`}` : null)
    }
    function up(e: globalThis.PointerEvent) {
      const d = drag.current
      if (!d) return
      if (d.moving) {
        // The press ended a drag, not a click: don't let it open the post's menu.
        const swallow = (c: MouseEvent) => c.stopPropagation()
        window.addEventListener('click', swallow, { capture: true, once: true })
        setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0)
        d.el.style.transform = ''
        const t = targetAt(e.clientX, e.clientY)
        if (t) onDrop(d.id, t)
      }
      end()
    }
    window.addEventListener('pointermove', move, { passive: false })
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', end)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', end)
    }
  }, [onDrop, end])

  /** Spread on a post's root element. */
  const handle = (id: string) => ({
    onPointerDown(e: PointerEvent<HTMLElement>) {
      if (e.button !== 0) return
      const fromGrip = (e.target as HTMLElement).closest('[data-grip]')
      if (e.pointerType !== 'mouse' && !fromGrip) return
      drag.current = { id, el: e.currentTarget, x: e.clientX, y: e.clientY, moving: false }
    },
  })

  return { handle, dragging, over }
}
