import type { Platform } from '../api/types'
import { PLATFORMS } from './platforms'

const KEY = 'voxlace-platforms'

/** "Which platforms?" remembers the last choice per browser (DESIGN.md §4.1). */
export function savedPlatforms(): Platform[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown
    const picked = Array.isArray(v) ? PLATFORMS.filter((p) => v.includes(p)) : []
    return picked.length ? picked : ['telegram']
  } catch {
    return ['telegram']
  }
}

export function savePlatforms(platforms: Platform[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(platforms))
  } catch {
    // private mode: remembered for this page only
  }
}
