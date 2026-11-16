// Tests for the podium: who gets a step of their own and when a tie gets
// one step that counts them.

import { describe, expect, it } from 'vitest'
import { podiumSteps, type PodiumStep, type TieStep } from './podium'
import { standings } from './ranking'
import { fakeRow, modelOf, TODAY } from './test-helpers'

// Rows from a list of ranks, named A, B, C... in board order. Reps who share
// a rank share their numbers too, the way a real tie does.
const board = (...ranks: number[]) => ranks.map((rank, i) => fakeRow(String.fromCharCode(65 + i), rank, { total: 30 - rank }))
// What each step is, short: A@1 for a rep on a first place step,
// 3x2@2 for three reps tied for 2nd counted on a second place step.
const shape = (steps: PodiumStep[]) => steps.map((s) => (s.kind === 'rep' ? `${s.row.rep.name}@${s.place}` : `${s.count}x${s.rank}@${s.place}`))
const tie = (steps: PodiumStep[]) => steps.find((s): s is TieStep => s.kind === 'tie')

describe('podiumSteps', () => {
  it('has nothing to show for an empty board', () => {
    expect(podiumSteps([])).toEqual([])
  })

  it('shows fewer than three on a short board', () => {
    expect(shape(podiumSteps(board(1)))).toEqual(['A@1'])
    expect(shape(podiumSteps(board(1, 2)))).toEqual(['A@1', 'B@2'])
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

  it('never picks part of a tie, however big, and stops after it', () => {
    const big = board(...Array.from({ length: 113 }, () => 1), 114)
    const steps = podiumSteps(big)
    expect(steps).toHaveLength(1)
    expect(tie(steps)).toMatchObject({ rank: 1, count: 113, start: 0, end: 113, place: 1, fills: true })
    // A tie ending the board works the same.
    expect(tie(podiumSteps(board(1, 2, 2, 2)))).toMatchObject({ start: 1, end: 4, count: 3 })
  })

  it('carries the tie’s minimums met and stamps, which everyone in it shares', () => {
    const rows = ['A', 'B', 'C', 'D'].map((name) => fakeRow(name, 2, { met: 3, total: 14 }))
    expect(tie(podiumSteps([fakeRow('Top', 1, { met: 4, total: 9 }), ...rows]))).toMatchObject({ rank: 2, met: 3, stamps: 14 })
  })

  it('reads ranks from the full board, so a team’s lone 4th is still a rep step', () => {
    // A team filter: alone at 4th on the team but tied with other teams
    // overall, then a rep at 27th and three tied at 33rd.
    const federal = [
      fakeRow('Liam', 4, { met: 3, total: 13, team: 'Federal', tied: true }),
      fakeRow('Ethan', 27, { met: 3, total: 11, team: 'Federal' }),
      fakeRow('Aisha', 33, { met: 2, total: 11, team: 'Federal', tied: true }),
      fakeRow('Grace', 33, { met: 2, total: 11, team: 'Federal', tied: true }),
      fakeRow('Omar', 33, { met: 2, total: 11, team: 'Federal', tied: true }),
      fakeRow('Ruth', 42, { met: 1, total: 9, team: 'Federal' }),
    ]
    const steps = podiumSteps(federal)
    expect(shape(steps)).toEqual(['Liam@1', 'Ethan@2', '3x33@3'])
    expect(steps[0]).toMatchObject({ kind: 'rep', row: { tied: true } })
    expect(tie(steps)).toMatchObject({ start: 2, end: 5, met: 2, stamps: 11, teams: ['Federal'] })
  })

  it('lists each team in the tie once, in board order', () => {
    const teams = ['NetSec', 'POSB', 'NetSec', 'Federal', 'POSB']
    const steps = podiumSteps(teams.map((team, i) => fakeRow(String.fromCharCode(65 + i), 1, { team })))
    expect(tie(steps)?.teams).toEqual(['NetSec', 'POSB', 'Federal'])
    const one = podiumSteps(['A', 'B', 'C', 'D'].map((name) => fakeRow(name, 4, { team: 'NetSec' })))
    expect(tie(one)?.teams).toEqual(['NetSec'])
  })

  it('works on a real board', () => {
    const rows = standings(
      modelOf({
        Ana: '4 in person, 2 fairs, 2 hub, fall, spring',
        Ben: '4 in person, 2 fairs, 1 hub',
        Cy: '4 in person, 2 fairs, 1 hub',
        Di: '4 in person, 2 fairs, 1 hub',
        Ed: '1 fair',
      }),
      TODAY,
    )
    const steps = podiumSteps(rows)
    expect(shape(steps)).toEqual(['Ana@1', '3x2@2'])
    expect(tie(steps)).toMatchObject({ met: 2, stamps: 7, teams: ['POSB'] })
  })
})
