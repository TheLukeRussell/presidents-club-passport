// Demo changes survive a reload through localStorage. Some browsers block
// storage (private windows, locked-down work laptops) and throw on access,
// so every read and write is wrapped and the app just runs in memory instead.

import { ACTIVITIES, STORAGE_KEY, type Activity } from '../config'

export interface SavedDemo {
  viewAs?: string // rep id
  // Who the demo's Record stamped, by activity.
  recorded?: Partial<Record<Activity, string[]>>
}

export function readSaved(): { saved: SavedDemo; ok: boolean } {
  let raw: string | null
  try {
    raw = window.localStorage.getItem(STORAGE_KEY)
  } catch {
    // Only a read that throws means storage is blocked.
    return { saved: {}, ok: false }
  }
  if (!raw) return { saved: {}, ok: true }
  try {
    return { saved: clean(JSON.parse(raw)), ok: true }
  } catch {
    // Junk that won't parse. Start fresh; the next write replaces it.
    return { saved: {}, ok: true }
  }
}

// Keep only fields of the right shape. A half-written or hand-edited value
// used to crash the app on every load until the site data was cleared.
function clean(value: unknown): SavedDemo {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const { viewAs, recorded } = value as Record<string, unknown>
  const out: SavedDemo = {}
  if (typeof viewAs === 'string') out.viewAs = viewAs
  if (recorded && typeof recorded === 'object' && !Array.isArray(recorded)) {
    const kept: Partial<Record<Activity, string[]>> = {}
    for (const activity of ACTIVITIES) {
      const emails = (recorded as Record<string, unknown>)[activity]
      if (Array.isArray(emails) && emails.every((e) => typeof e === 'string')) kept[activity] = emails
    }
    if (Object.keys(kept).length) out.recorded = kept
  }
  return out
}

export function writeSaved(saved: SavedDemo): boolean {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(saved))
    return true
  } catch {
    return false
  }
}

// The live passport remembers, per signed-in user, that this browser has
// played the cover's celebration, so it plays once rather than on every
// visit. Its own key: the demo's Reset wipes pcp-demo-v1, and this isn't
// demo state. Blocked storage just means it may play again.
const LIVE_KEY = 'pcp-live-v1'

function readCelebrated(): string[] {
  try {
    const value = JSON.parse(window.localStorage.getItem(LIVE_KEY) ?? '{}') as { celebrated?: unknown }
    return Array.isArray(value.celebrated) ? value.celebrated.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

export const celebratedBefore = (userId: string) => readCelebrated().includes(userId)

export function noteCelebrated(userId: string) {
  try {
    window.localStorage.setItem(LIVE_KEY, JSON.stringify({ celebrated: [...new Set([...readCelebrated(), userId])] }))
  } catch {
    // Blocked. It may play again next time, which is harmless.
  }
}
