// What stands on the podium. Reps get their own step while their tie fits
// in the steps left. The first tie that doesn't fit becomes one step that
// counts them all, and the podium stops there, so nobody is picked out of a
// tie by the alphabet.

import type { StandingRow } from './ranking'

export const PODIUM_STEPS = 3

export interface RepStep {
  kind: 'rep'
  row: StandingRow
  // One plus how many reps on the podium rank strictly better. Two tied
  // for second both get 2.
  place: number
}

export interface TieStep {
  kind: 'tie'
  rank: number
  count: number
  // Where the tie sits in the rows passed in. Start is in it, end isn't.
  start: number
  end: number
  // A tie means the same minimums met and the same stamps, so one pair of
  // numbers speaks for everyone in it.
  met: number
  stamps: number
  teams: string[] // each team in the tie once, in board order
  place: number
  fills: boolean // the tie starts at the top, so it's the whole podium
}

export type PodiumStep = RepStep | TieStep

// Rows come sorted the way the board is, by rank.
export function podiumSteps(rows: readonly StandingRow[]): PodiumStep[] {
  const steps: PodiumStep[] = []
  let shown = 0
  let i = 0
  while (i < rows.length && shown < PODIUM_STEPS) {
    const rank = rows[i].rank
    let end = i + 1
    while (end < rows.length && rows[end].rank === rank) end++
    const group = rows.slice(i, end)
    if (group.length > PODIUM_STEPS - shown) {
      steps.push(tieStep(group, i, end, shown))
      break
    }
    for (const row of group) steps.push({ kind: 'rep', row, place: shown + 1 })
    shown += group.length
    i = end
  }
  return steps
}

function tieStep(group: readonly StandingRow[], start: number, end: number, shown: number): TieStep {
  const { stats } = group[0]
  return {
    kind: 'tie',
    rank: group[0].rank,
    count: group.length,
    start,
    end,
    met: stats.met,
    stamps: stats.total,
    teams: [...new Set(group.map((row) => row.rep.team))],
    place: shown + 1,
    fills: shown === 0,
  }
}
