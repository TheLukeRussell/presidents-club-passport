// Standings math: rank reps by minimums met, then by stamps, share ranks on
// ties, work out how far each rep moved since the last day anyone earned a
// stamp, and the figures at the top.

import type { Model, Rep } from './model'
import { lastStampDay, repStats, statusOf, type Context, type RepStats, type Status } from './rules'

export interface Score {
  met: number
  total: number
}

// More minimums met ranks higher. Between two reps who've met the same
// number, more stamps (extras included) ranks higher.
export function compareScores(a: Score, b: Score): number {
  return b.met - a.met || b.total - a.total
}

// Ties share a rank (1, 2, 2, 4) so nobody drops a spot because of the alphabet.
export function rankScores(items: { id: string; name: string; score: Score }[]): Map<string, number> {
  const sorted = [...items].sort((a, b) => compareScores(a.score, b.score) || a.name.localeCompare(b.name))
  const ranks = new Map<string, number>()
  sorted.forEach((item, index) => {
    const prev = sorted[index - 1]
    const tied = prev && compareScores(prev.score, item.score) === 0
    ranks.set(item.id, tied ? ranks.get(prev.id)! : index + 1)
  })
  return ranks
}

export type Change = { kind: 'up' | 'down'; places: number } | { kind: 'same' } | { kind: 'none' }

export interface StandingRow {
  rep: Rep
  stats: RepStats
  status: Status
  rank: number
  tied: boolean // shares its rank with someone, anywhere on the full board
  change: Change
  above: boolean // qualified: all five minimums met
}

// "Change" means: rank now, versus rank the day before the last day anyone
// earned a stamp. After the demo records something, that's today.
export function changeFor(now: number, before: number | undefined, hasHistory: boolean): Change {
  if (!hasHistory || before === undefined) return { kind: 'none' }
  if (now === before) return { kind: 'same' }
  return now < before ? { kind: 'up', places: before - now } : { kind: 'down', places: now - before }
}

export function dayBefore(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d) - 86400000).toISOString().slice(0, 10)
}

function ranksAt(model: Model, ctx: Context) {
  const stats = new Map(model.reps.map((rep) => [rep.id, repStats(model, rep, ctx)]))
  const ranks = rankScores(model.reps.map((rep) => ({ id: rep.id, name: rep.name, score: stats.get(rep.id)! })))
  return { stats, ranks }
}

export function standings(model: Model, ctx: Context): StandingRow[] {
  const { stats, ranks } = ranksAt(model, ctx)
  const latest = lastStampDay(model, ctx)
  const earlier = latest ? { today: dayBefore(latest) } : null
  const hasHistory = Boolean(earlier && lastStampDay(model, earlier))
  const before = hasHistory && earlier ? ranksAt(model, earlier).ranks : new Map<string, number>()

  // How many reps hold each rank, so a tie reads the same on a team filter
  // as it does on the full board.
  const holders = new Map<number, number>()
  for (const rank of ranks.values()) holders.set(rank, (holders.get(rank) ?? 0) + 1)

  const rows = model.reps.map((rep): StandingRow => {
    const repStats = stats.get(rep.id)!
    const rank = ranks.get(rep.id)!
    return {
      rep,
      stats: repStats,
      status: statusOf(repStats),
      rank,
      tied: holders.get(rank)! > 1,
      change: changeFor(rank, before.get(rep.id), hasHistory),
      above: repStats.qualified,
    }
  })
  return rows.sort((a, b) => a.rank - b.rank || a.rep.name.localeCompare(b.rep.name))
}

export interface Figures {
  qualified: number
  activitiesDone: number // every activity done, quota or not
  averageStamps: number | null
  reps: number
}

// The three numbers at the top of Standings, for whatever rows are showing.
export function figuresFor(rows: StandingRow[]): Figures {
  const sum = rows.reduce((total, row) => total + row.stats.total, 0)
  return {
    qualified: rows.filter((row) => row.above).length,
    activitiesDone: rows.filter((row) => row.stats.activitiesDone).length,
    averageStamps: rows.length ? sum / rows.length : null,
    reps: rows.length,
  }
}

// Where the President's Club line falls in a sorted board: the index of the
// first rep who hasn't qualified. Qualified reps always sort first, since
// five met beats anything less.
export function lineIndex(rows: StandingRow[]): number {
  const index = rows.findIndex((row) => !row.above)
  return index === -1 ? rows.length : index
}
