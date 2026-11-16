// Page math for the passport book. Page 0 is the front cover, then eight
// inside pages (the inside cover, the data page, a page for each of the four
// activities, the checklist and the quota seal), then page 9, the back cover.
// On a phone you see one page at a time. On a wide screen you see spreads:
// the closed front, pages 1 and 2, 3 and 4, 5 and 6, 7 and 8, then the closed back.

import type { Activity } from '../config'

export const PAGE_COUNT = 8 // inside pages
export const DATA_PAGE = 2
export const CHECKLIST_PAGE = 7
export const SEAL_PAGE = 8
export const BACK_COVER = PAGE_COUNT + 1
// How long a page turn takes, matching --dur-turn.
export const TURN_MS = 640

export interface PageInfo {
  page: number
  name: string
  activity?: Activity
}

export const PAGES: PageInfo[] = [
  { page: 1, name: 'Inside cover' },
  { page: 2, name: 'Data page' },
  { page: 3, name: 'Supplier trainings', activity: 'training' },
  { page: 4, name: 'Supplier fairs', activity: 'fair' },
  { page: 5, name: 'Hub training', activity: 'hub' },
  { page: 6, name: 'Club Express', activity: 'club' },
  { page: 7, name: 'President’s Club checklist' },
  { page: 8, name: 'Quota seal', activity: 'quota' },
]

export const ALL_PAGES = Array.from({ length: BACK_COVER + 1 }, (_, i) => i)

// The page each activity's stamps live on. Quota's gold seal has its own page.
export function pageForActivity(activity: Activity): number {
  return PAGES.find((p) => p.activity === activity)!.page
}

// Anything that isn't a whole page number from 1 to the back cover means the front cover.
export function parsePage(value: string | null): number {
  const n = Number(value)
  return Number.isInteger(n) && n >= 1 && n <= BACK_COVER ? n : 0
}

export function viewCount(spread: boolean): number {
  return spread ? 2 + PAGE_COUNT / 2 : BACK_COVER + 1
}

const lastSpread = () => 1 + PAGE_COUNT / 2

// A "view" is what's in front of you: one page on a phone, a spread on a
// wide screen. Page 3 on a wide screen is spread 2 (pages 3 and 4).
export function viewForPage(page: number, spread: boolean): number {
  if (!spread) return page
  if (page === 0) return 0
  if (page === BACK_COVER) return lastSpread()
  return Math.ceil(page / 2)
}

// The page number to put in the URL for a view. On a wide screen the first
// spread maps to the data page, so the same link opens the data page on a phone.
export function pageForView(view: number, spread: boolean): number {
  if (!spread) return view
  if (view === 0) return 0
  if (view === lastSpread()) return BACK_COVER
  return view === 1 ? DATA_PAGE : view * 2 - 1
}

// The pages showing in a view. Spreads are [left, right]. The closed book on
// a wide screen is [null, 0] at the front (the cover on the right) and
// [9, null] at the back (the back cover on the left).
export function pagesInView(view: number, spread: boolean): (number | null)[] {
  if (!spread) return [view]
  if (view === 0) return [null, 0]
  if (view === lastSpread()) return [BACK_COVER, null]
  return [view * 2 - 1, view * 2]
}

export function viewLabel(view: number, spread: boolean): string {
  const pages = pagesInView(view, spread).filter((p): p is number => p !== null)
  if (pages.length === 1 && pages[0] === 0) return 'Cover'
  if (pages.length === 1 && pages[0] === BACK_COVER) return 'Back cover'
  if (pages.length === 1) return `${PAGES[pages[0] - 1].name}, page ${pages[0]} of ${PAGE_COUNT}`
  return `Pages ${pages[0]} and ${pages[1]} of ${PAGE_COUNT}`
}
