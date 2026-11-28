import { act, renderHook } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { announceDrafts, dismissDone, useDoneNotice } from './doneAlert'

function setHidden(hidden: boolean) {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => (hidden ? 'hidden' : 'visible'),
  })
}

afterEach(() => {
  setHidden(false)
  dismissDone()
  vi.unstubAllGlobals()
})

test('drafts that finish while you are on another page show the in-app notice', () => {
  window.history.pushState({}, '', '/calendar')
  const { result } = renderHook(() => useDoneNotice())
  act(() => announceDrafts('t1', 2))
  expect(result.current).toEqual({ threadId: 't1', count: 2 })
  act(() => dismissDone())
  expect(result.current).toBeNull()
})

test('nothing to say when you are already looking at that chat', () => {
  window.history.pushState({}, '', '/chat/t1')
  const { result } = renderHook(() => useDoneNotice())
  act(() => announceDrafts('t1', 1))
  expect(result.current).toBeNull()
})

test('in another tab: the title says so until you come back, and a desktop alert if allowed', () => {
  const Notification = vi.fn() as unknown as typeof window.Notification
  Object.assign(Notification, { permission: 'granted' })
  vi.stubGlobal('Notification', Notification)
  window.history.pushState({}, '', '/chat/t1')
  document.title = 'Voxlace'
  setHidden(true)
  announceDrafts('t1', 3)
  expect(document.title).toBe('✓ Drafts ready · Voxlace')
  expect(Notification).toHaveBeenCalledWith(
    'Your drafts are ready',
    expect.objectContaining({ body: '3 drafts are ready to review.' }),
  )
  setHidden(false)
  document.dispatchEvent(new Event('visibilitychange'))
  expect(document.title).toBe('Voxlace')
})

test('a failed write (no drafts) announces nothing', () => {
  window.history.pushState({}, '', '/calendar')
  const { result } = renderHook(() => useDoneNotice())
  act(() => announceDrafts('t1', 0))
  expect(result.current).toBeNull()
})
