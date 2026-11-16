// Tests for the book's page math: eight inside pages, the covers either side,
// and spreads of 1|2, 3|4, 5|6 and 7|8 on a wide screen.

import { describe, expect, it } from 'vitest'
import { ACTIVITIES } from '../config'
import {
  ALL_PAGES,
  BACK_COVER,
  CHECKLIST_PAGE,
  DATA_PAGE,
  PAGE_COUNT,
  PAGES,
  SEAL_PAGE,
  pageForActivity,
  pageForView,
  pagesInView,
  parsePage,
  viewCount,
  viewForPage,
  viewLabel,
} from './book'

describe('book', () => {
  it('has eight inside pages between the covers', () => {
    expect(PAGE_COUNT).toBe(8)
    expect(BACK_COVER).toBe(9)
    expect(ALL_PAGES).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(PAGES.map((p) => p.page)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect([DATA_PAGE, CHECKLIST_PAGE, SEAL_PAGE]).toEqual([2, 7, 8])
  })

  it('gives each activity its own page, with the quota on the seal page', () => {
    expect(Object.fromEntries(ACTIVITIES.map((a) => [a, pageForActivity(a)]))).toEqual({ training: 3, fair: 4, hub: 5, club: 6, quota: 8 })
    expect(PAGES.map((p) => p.name)).toEqual([
      'Inside cover',
      'Data page',
      'Supplier trainings',
      'Supplier fairs',
      'Hub training',
      'Club Express',
      'President’s Club checklist',
      'Quota seal',
    ])
  })

  it('reads the page from the url and falls back to the cover', () => {
    expect(parsePage('4')).toBe(4)
    expect(parsePage('8')).toBe(8)
    expect(parsePage('9')).toBe(BACK_COVER)
    expect(parsePage(null)).toBe(0)
    expect(parsePage('0')).toBe(0)
    expect(parsePage('10')).toBe(0)
    expect(parsePage('-1')).toBe(0)
    expect(parsePage('2.5')).toBe(0)
    expect(parsePage('nope')).toBe(0)
  })

  it('counts views, both covers included', () => {
    expect(viewCount(true)).toBe(6)
    expect(viewCount(false)).toBe(10)
  })

  it('maps pages to spreads and back', () => {
    expect(ALL_PAGES.map((p) => viewForPage(p, true))).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4, 5])
    expect([0, 1, 2, 3, 4, 5].map((v) => pageForView(v, true))).toEqual([0, 2, 3, 5, 7, 9])
    expect(viewForPage(7, false)).toBe(7)
    expect(pageForView(8, false)).toBe(8)
  })

  it('lands every page back in a view that shows it', () => {
    for (const spread of [true, false]) {
      for (const page of ALL_PAGES) expect(pagesInView(viewForPage(page, spread), spread), `${page} ${spread}`).toContain(page)
      for (let view = 0; view < viewCount(spread); view++) expect(viewForPage(pageForView(view, spread), spread)).toBe(view)
    }
  })

  it('lists what is showing, with the closed book at both ends', () => {
    expect(pagesInView(0, true)).toEqual([null, 0])
    expect(pagesInView(1, true)).toEqual([1, 2])
    expect(pagesInView(2, true)).toEqual([3, 4])
    expect(pagesInView(3, true)).toEqual([5, 6])
    expect(pagesInView(4, true)).toEqual([7, 8])
    expect(pagesInView(5, true)).toEqual([BACK_COVER, null])
    expect(pagesInView(2, false)).toEqual([2])
  })

  it('labels the view for screen readers', () => {
    expect(viewLabel(0, true)).toBe('Cover')
    expect(viewLabel(1, true)).toBe('Pages 1 and 2 of 8')
    expect(viewLabel(4, true)).toBe('Pages 7 and 8 of 8')
    expect(viewLabel(5, true)).toBe('Back cover')
    expect(viewLabel(0, false)).toBe('Cover')
    expect(viewLabel(3, false)).toBe('Supplier trainings, page 3 of 8')
    expect(viewLabel(7, false)).toBe('President’s Club checklist, page 7 of 8')
    expect(viewLabel(8, false)).toBe('Quota seal, page 8 of 8')
    expect(viewLabel(9, false)).toBe('Back cover')
  })
})
