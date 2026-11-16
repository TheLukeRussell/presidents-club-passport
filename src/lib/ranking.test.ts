// Tests for the order of the board, shared ranks, movement since the last
// stamp day, the President's Club line and the figures.

import { describe, expect, it } from 'vitest'
import { DEMO_TODAY } from '../config'
import { changeFor, compareScores, dayBefore, figuresFor, lineIndex, rankScores, standings } from './ranking'
import { fakeRow, modelOf, stampRow, TODAY } from './test-helpers'

// Everything but the quota, and everything with it.
const DONE = '4 in person, 2 fairs, 2 hub, fall, spring'
const ALL = `${DONE}, quota`

const order = (rows: ReturnType<typeof standings>) => rows.map((r) => `${r.rank}${r.tied ? 'T' : ''} ${r.rep.name}`)

describe('compareScores', () => {
  it('puts more minimums met first, whatever the stamps', () => {
    expect(compareScores({ met: 3, total: 8 }, { met: 2, total: 15 })).toBeLessThan(0)
    expect(compareScores({ met: 1, total: 20 }, { met: 2, total: 4 })).toBeGreaterThan(0)
  })
  it('breaks a tie on minimums with more stamps', () => {
    expect(compareScores({ met: 2, total: 12 }, { met: 2, total: 10 })).toBeLessThan(0)
    expect(compareScores({ met: 2, total: 10 }, { met: 2, total: 10 })).toBe(0)
  })
})

describe('rankScores', () => {
  it('shares ranks on ties and skips the next number', () => {
    const ranks = rankScores([
      { id: 'd', name: 'Di', score: { met: 1, total: 3 } },
      { id: 'c', name: 'Cy', score: { met: 3, total: 9 } },
      { id: 'a', name: 'Ana', score: { met: 4, total: 9 } },
      { id: 'b', name: 'Ben', score: { met: 3, total: 9 } },
      { id: 'e', name: 'Ed', score: { met: 0, total: 0 } },
    ])
    expect(Object.fromEntries(ranks)).toEqual({ a: 1, b: 2, c: 2, d: 4, e: 5 })
  })

  it('ranks everyone, even with nothing done', () => {
    const ranks = rankScores([
      { id: 'a', name: 'Ana', score: { met: 0, total: 0 } },
      { id: 'b', name: 'Ben', score: { met: 0, total: 0 } },
    ])
    expect(Object.fromEntries(ranks)).toEqual({ a: 1, b: 1 })
  })
})

describe('standings', () => {
  const model = modelOf({
    Zed: '3 in person, 6 virtual, 2 fairs, 1 hub', // 1 met, 12 stamps
    Ana: '4 in person, 2 fairs, 2 hub', // 3 met, 8 stamps
    Ben: '4 in person, 2 fairs, 1 hub', // 2 met, 7 stamps
    Cy: '4 in person, 2 fairs, 1 hub', // the same as Ben
    Di: '1 virtual',
  })
  const board = standings(model, TODAY)

  it('ranks by minimums met, then by stamps, with ties in name order', () => {
    expect(order(board)).toEqual(['1 Ana', '2T Ben', '2T Cy', '4 Zed', '5 Di'])
  })

  it('gives every rep a number rank and their status', () => {
    expect(board.every((r) => Number.isInteger(r.rank))).toBe(true)
    expect(board.map((r) => r.status)).toEqual(['out-of-reach', 'out-of-reach', 'out-of-reach', 'out-of-reach', 'out-of-reach'])
    const early = standings(model, { today: '2026-07-01' })
    expect(early.every((r) => r.status === 'to-go')).toBe(true)
  })

  it('puts qualified reps first and marks them above the line', () => {
    const rows = standings(modelOf({ Ana: DONE, Ben: ALL, Cy: '6 in person, 6 virtual, 4 fairs, 8 hub, fall, spring' }), TODAY)
    expect(order(rows)).toEqual(['1 Ben', '2 Cy', '3 Ana'])
    expect(rows.map((r) => [r.above, r.status])).toEqual([
      [true, 'qualified'],
      [false, 'on-track'],
      [false, 'on-track'],
    ])
  })

  it('marks ties from the whole board, so a filtered board keeps them', () => {
    const cy = board.find((r) => r.rep.name === 'Cy')!
    expect(cy.tied).toBe(true)
    // Filtering out Ben doesn't make Cy's rank any less shared.
    expect(board.filter((r) => r.rep.name !== 'Ben').find((r) => r.rep.name === 'Cy')!.tied).toBe(true)
  })

  it('has no movement when every stamp landed on one day', () => {
    const one = standings(modelOf({ Ana: '', Ben: '' }, [stampRow('Ana', 'fair', '2027-03-04'), stampRow('Ben', 'hub', '2027-03-04')]), TODAY)
    expect(one.map((r) => r.change)).toEqual([{ kind: 'none' }, { kind: 'none' }])
  })

  it('has no movement before anyone has a stamp', () => {
    expect(standings(modelOf({ Ana: '', Ben: '' }), TODAY).map((r) => r.change.kind)).toEqual(['none', 'none'])
  })
})

describe('change since the last stamp day', () => {
  // Ana and Ben each have a fair in March. Then Ben gets another fair and a
  // Hub course on today's date, which takes him past Ana.
  const cast = { Ana: '', Ben: '', Cy: '' }
  const march = [stampRow('Ana', 'fair', '2027-03-04'), stampRow('Ana', 'hub', '2027-03-05'), stampRow('Ben', 'fair', '2027-03-04')]
  const today = [stampRow('Ben', 'fair', DEMO_TODAY, { event: 'Summer Supplier Fair' }), stampRow('Ben', 'hub', DEMO_TODAY)]

  it('compares the board with the day before the last stamp day', () => {
    const rows = standings(modelOf(cast, [...march, ...today]), TODAY)
    expect(rows.map((r) => [r.rep.name, r.rank, r.change])).toEqual([
      ['Ben', 1, { kind: 'up', places: 1 }],
      ['Ana', 2, { kind: 'down', places: 1 }],
      ['Cy', 3, { kind: 'same' }],
    ])
  })

  it('looks back from the last stamp day, not from today', () => {
    // Without today's stamps the last day is March 5, when Ana's Hub course
    // put her ahead of Ben, who was level with her the day before.
    const rows = standings(modelOf(cast, march), TODAY)
    expect(rows.map((r) => [r.rep.name, r.rank, r.change])).toEqual([
      ['Ana', 1, { kind: 'same' }],
      ['Ben', 2, { kind: 'down', places: 1 }],
      ['Cy', 3, { kind: 'same' }],
    ])
  })

  it('ignores stamps dated after today', () => {
    const later = [stampRow('Cy', 'fair', '2027-06-20'), stampRow('Cy', 'hub', '2027-06-21'), stampRow('Cy', 'quota', '2027-06-30')]
    const rows = standings(modelOf(cast, [...march, ...today, ...later]), TODAY)
    expect(rows.map((r) => [r.rep.name, r.stats.total, r.change.kind])).toEqual([
      ['Ben', 3, 'up'],
      ['Ana', 2, 'down'],
      ['Cy', 0, 'same'],
    ])
  })
})

describe('changeFor', () => {
  it('reads up, down, the same, or nothing to compare with', () => {
    expect(changeFor(3, 5, true)).toEqual({ kind: 'up', places: 2 })
    expect(changeFor(5, 3, true)).toEqual({ kind: 'down', places: 2 })
    expect(changeFor(4, 4, true)).toEqual({ kind: 'same' })
    expect(changeFor(4, undefined, true)).toEqual({ kind: 'none' })
    expect(changeFor(4, 1, false)).toEqual({ kind: 'none' })
  })
})

describe('dayBefore', () => {
  it('steps back across months, years and leap days', () => {
    expect(dayBefore('2027-06-17')).toBe('2027-06-16')
    expect(dayBefore('2027-03-01')).toBe('2027-02-28')
    expect(dayBefore('2028-03-01')).toBe('2028-02-29')
    expect(dayBefore('2027-01-01')).toBe('2026-12-31')
  })
})

describe('lineIndex', () => {
  it('falls after the last qualified rep', () => {
    expect(lineIndex([fakeRow('A', 1, { met: 5 }), fakeRow('B', 2, { met: 5 }), fakeRow('C', 3, { met: 4 })])).toBe(2)
  })
  it('sits at the top when nobody has qualified, and at the bottom when everyone has', () => {
    expect(lineIndex([fakeRow('A', 1, { met: 4 }), fakeRow('B', 2)])).toBe(0)
    expect(lineIndex([fakeRow('A', 1, { met: 5 }), fakeRow('B', 1, { met: 5 })])).toBe(2)
    expect(lineIndex([])).toBe(0)
  })
  it('matches a real board', () => {
    const rows = standings(modelOf({ Ana: ALL, Ben: DONE, Cy: ALL, Di: '1 fair' }), TODAY)
    expect(lineIndex(rows)).toBe(2)
    expect(rows.slice(0, 2).map((r) => r.rep.name)).toEqual(['Ana', 'Cy'])
  })
})

describe('figuresFor', () => {
  it('counts qualified, activities done and the average stamps', () => {
    const rows = standings(modelOf({ Ana: ALL, Ben: DONE, Cy: '2 fairs', Di: '' }), TODAY)
    expect(figuresFor(rows)).toEqual({ qualified: 1, activitiesDone: 2, averageStamps: (11 + 10 + 2 + 0) / 4, reps: 4 })
  })
  it('works on whatever rows are showing, and has no average for none', () => {
    expect(figuresFor([])).toEqual({ qualified: 0, activitiesDone: 0, averageStamps: null, reps: 0 })
    expect(figuresFor([fakeRow('A', 1, { met: 4, total: 9, activitiesDone: true })])).toEqual({
      qualified: 0,
      activitiesDone: 1,
      averageStamps: 9,
      reps: 1,
    })
  })
})
