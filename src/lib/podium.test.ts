// Tests for the podium: who gets a step of their own and when a tie gets
// one step that counts them.

import { describe, expect, it } from 'vitest'
import { podiumSteps, type PodiumStep, type TieStep } from './podium'
import type { StandingRow } from './ranking'

// A board row with just what the podium reads. Rank null is unranked.
function row(name: string, rank: number | null, attended = 9, recorded = 10, team = 'POSB', tied = false): StandingRow {
  return {
    rep: { id: name.toLowerCase(), email: `${name.toLowerCase()}@example.com`, name, team },
    stats: { attended, recorded, rate: recorded ? attended / recorded : null, left: 0, toLine: { kind: 'above', onLine: false }, streak: 0, next: null },
    rank,
    tied,
    change: { kind: 'none' },
    above: rank !== null && attended / recorded >= 0.75,
  }
}

// Rows from a list of ranks, named A, B, C... in board order.
const board = (...ranks: (number | null)[]) => ranks.map((rank, i) => row(String.fromCharCode(65 + i), rank))
// What each step is, short: A@1 for a rep on a first place step,
// 3x2@2 for three reps tied for 2nd counted on a second place step.
const shape = (steps: PodiumStep[]) => steps.map((s) => (s.kind === 'rep' ? `${s.row.rep.name}@${s.place}` : `${s.count}x${s.rank}@${s.place}`))
const tie = (steps: PodiumStep[]) => steps.find((s): s is TieStep => s.kind === 'tie')

describe('podiumSteps', () => {
  it('has nothing to show for an empty board or nobody ranked', () => {
    expect(podiumSteps([])).toEqual([])
    expect(podiumSteps(board(null, null))).toEqual([])
  })

  it('shows fewer than three when fewer are ranked', () => {
    expect(shape(podiumSteps(board(1)))).toEqual(['A@1'])
    expect(shape(podiumSteps(board(1, 2, null)))).toEqual(['A@1', 'B@2'])
    expect(shape(podiumSteps(board(1, 1)))).toEqual(['A@1', 'B@1'])
  })

  it('gives three clean places a step each', () => {
    expect(shape(podiumSteps(board(1, 2, 3, 4)))).toEqual(['A@1', 'B@2', 'C@3'])
  })

  it('keeps a tie that fits as rep steps on the same height', () => {
    expect(shape(podiumSteps(board(1, 2, 2, 4)))).toEqual(['A@1', 'B@2', 'C@2'])
    expect(shape(podiumSteps(board(1, 1, 1, 4)))).toEqual(['A@1', 'B@1', 'C@1'])
    expect(shape(podiumSteps(board(1, 1, 3, 4)))).toEqual(['A@1', 'B@1', 'C@3'])
  })

  it('counts a tie for the top that won’t fit as one step that fills the podium', () => {
    const steps = podiumSteps(board(1, 1, 1, 1, 5))
    expect(shape(steps)).toEqual(['4x1@1'])
    expect(tie(steps)).toMatchObject({ start: 0, end: 4, fills: true })
  })

  it('counts a tie for second that won’t fit, after the rep in first', () => {
    const steps = podiumSteps(board(1, 2, 2, 2, 5))
    expect(shape(steps)).toEqual(['A@1', '3x2@2'])
    expect(tie(steps)).toMatchObject({ start: 1, end: 4, fills: false })
  })

  it('counts a tie for third that won’t fit, after two reps', () => {
    const steps = podiumSteps(board(1, 2, 3, 3, 5))
    expect(shape(steps)).toEqual(['A@1', 'B@2', '2x3@3'])
    expect(tie(steps)).toMatchObject({ start: 2, end: 4, fills: false })
    // Two tied for first fit, the next two don't.
    expect(shape(podiumSteps(board(1, 1, 3, 3)))).toEqual(['A@1', 'B@1', '2x3@3'])
  })

  it('never picks part of a tie, however big', () => {
    const big = board(...Array.from({ length: 113 }, () => 1), 114)
    const steps = podiumSteps(big)
    expect(steps).toHaveLength(1)
    expect(tie(steps)).toMatchObject({ rank: 1, count: 113, start: 0, end: 113, place: 1, fills: true })
  })

  it('reads ranks from the full board, so a team’s lone T4 is still a rep step', () => {
    // Liam on Federal: alone at 4th on his team, tied with NetSec reps
    // overall, then a rep at 27th and three tied at 33rd.
    const federal = [
      row('Liam', 4, 7, 8, 'Federal', true),
      row('Ethan', 27, 6, 8, 'Federal'),
      row('Aisha', 33, 5, 8, 'Federal', true),
      row('Grace', 33, 5, 8, 'Federal', true),
      row('Omar', 33, 5, 8, 'Federal', true),
      row('Ruth', 42, 4, 8, 'Federal'),
    ]
    const steps = podiumSteps(federal)
    expect(shape(steps)).toEqual(['Liam@1', 'Ethan@2', '3x33@3'])
    expect(steps[0]).toMatchObject({ kind: 'rep', row: { tied: true } })
    expect(tie(steps)).toMatchObject({ start: 2, end: 5, rate: 5 / 8, stamps: { attended: 5, recorded: 8 }, teams: ['Federal'] })
  })

  it('ignores unranked reps and keeps indices right with them at the bottom', () => {
    const steps = podiumSteps([row('A', 1), row('B', 2), row('C', 2), row('D', 2), row('E', null), row('F', null)])
    expect(tie(steps)).toMatchObject({ start: 1, end: 4, count: 3 })
    // Nobody ranked past the tie: the unranked reps never join it.
    const onlyTie = podiumSteps([row('A', 1), row('B', 1), row('C', 1), row('D', 1), row('E', null)])
    expect(tie(onlyTie)).toMatchObject({ start: 0, end: 4, count: 4 })
  })

  it('shows stamps only when every rep in the tie has the same ones', () => {
    const mixed = podiumSteps([row('A', 1, 7, 9), row('B', 1, 14, 18), row('C', 1, 7, 9), row('D', 1, 7, 9)])
    expect(tie(mixed)).toMatchObject({ rate: 7 / 9, stamps: null })
    const same = podiumSteps([row('A', 1, 7, 9), row('B', 1, 7, 9), row('C', 1, 7, 9), row('D', 1, 7, 9)])
    expect(tie(same)?.stamps).toEqual({ attended: 7, recorded: 9 })
  })

  it('lists each team in the tie once, in board order', () => {
    const steps = podiumSteps([
      row('A', 1, 10, 10, 'NetSec'),
      row('B', 1, 10, 10, 'POSB'),
      row('C', 1, 10, 10, 'NetSec'),
      row('D', 1, 10, 10, 'Federal'),
      row('E', 1, 10, 10, 'POSB'),
    ])
    expect(tie(steps)?.teams).toEqual(['NetSec', 'POSB', 'Federal'])
    const one = podiumSteps(['A', 'B', 'C', 'D'].map((name) => row(name, 4, 7, 8, 'NetSec')))
    expect(tie(one)?.teams).toEqual(['NetSec'])
  })
})
