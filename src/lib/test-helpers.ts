// Builds small fake sheets for the tests, so each one reads like a story:
// sheet({ Ana: '3 in person, 1 virtual, 2 fairs, 1 hub, Club Express Fall' }).

import { ACTIVITIES, CLUB_EXPRESS, DEMO_TODAY, FISCAL_YEAR, HUB_COURSES, SUPPLIERS, type Activity } from '../config'
import type { PassportData, RepRow, StampRow } from '../data/types'
import { buildModel, findRep, repIdFromEmail, type Model, type Rep } from './model'
import type { StandingRow } from './ranking'
import { repStats, statusOf, type Context, type RepStats } from './rules'

export const TODAY: Context = { today: DEMO_TODAY }

export const emailOf = (name: string) => `${name.toLowerCase().replace(/\s+/g, '.')}@example.com`
export const idOf = (name: string) => repIdFromEmail(emailOf(name))

// The days things happened, all before the demo's today. A rep's nth
// in-person training is on IN_PERSON_DAYS[n], so reps with the same story
// were at the same events, the way a real room works.
export const IN_PERSON_DAYS = ['2026-07-28', '2026-08-26', '2026-09-23', '2026-10-21', '2026-12-02', '2027-01-20', '2027-03-17', '2027-04-21']
export const VIRTUAL_DAYS = ['2026-08-12', '2026-10-07', '2026-12-09', '2027-02-10', '2027-04-14', '2027-05-12']
export const FAIR_DAYS = ['2026-09-10', '2026-12-03', '2027-03-04', '2027-05-05']
export const HUB_DAYS = ['2026-07-15', '2026-09-01', '2026-11-04', '2027-01-06', '2027-02-17', '2027-03-24', '2027-04-28', '2027-06-02']
const [FALL, SPRING] = CLUB_EXPRESS

export function repRow(name: string, team = 'POSB', start = ''): RepRow {
  return { rep_email: emailOf(name), rep_name: name, team, start_date: start }
}

// One stamp with sensible defaults for its activity. Pass `over` to change
// any column.
export function stampRow(name: string, activity: Activity, date: string, over: Partial<StampRow> = {}): StampRow {
  const base: Record<Activity, Omit<StampRow, 'rep_email' | 'activity' | 'date'>> = {
    training: { event: 'Zebra solutions workshop', supplier: 'Zebra', format: 'in person', location: 'Greenville' },
    fair: { event: 'Supplier fair', supplier: '', format: 'in person', location: 'Atlanta' },
    hub: { event: HUB_COURSES[0].event, supplier: HUB_COURSES[0].supplier, format: '', location: '' },
    club: { event: CLUB_EXPRESS.find((e) => e.date === date)?.title ?? 'Club Express', supplier: '', format: 'in person', location: 'Greenville' },
    quota: { event: `${FISCAL_YEAR} sales growth quota`, supplier: '', format: '', location: '' },
  }
  return { rep_email: emailOf(name), activity, date, ...base[activity], ...over }
}

function take<T>(list: readonly T[], n: number, what: string): T[] {
  if (n > list.length) throw new Error(`test-helpers: the calendar only has ${list.length} ${what}`)
  return list.slice(0, n)
}

// Turns "3 in person, 1 virtual, 2 fairs, 1 hub, Club Express Fall, quota"
// into stamp rows. Anything it doesn't know throws, so a typo can't quietly
// pass a test. Quota lands on the demo's today, like the demo's seal.
export function stampsFor(name: string, story: string): StampRow[] {
  const rows: StampRow[] = []
  for (const part of story.split(',').map((p) => p.trim().toLowerCase()).filter(Boolean)) {
    const counted = /^(\d+) (in[- ]person|virtual|(?:supplier )?fairs?|hub)(?: trainings?| courses?)?$/.exec(part)
    if (counted) {
      const n = Number(counted[1])
      const kind = counted[2]
      if (kind.startsWith('in')) {
        take(IN_PERSON_DAYS, n, 'in-person trainings').forEach((date, i) => {
          const supplier = SUPPLIERS[i]
          rows.push(stampRow(name, 'training', date, { event: `${supplier} solutions workshop`, supplier }))
        })
      } else if (kind === 'virtual') {
        take(VIRTUAL_DAYS, n, 'virtual trainings').forEach((date, i) => {
          const supplier = SUPPLIERS[SUPPLIERS.length - 1 - i]
          rows.push(stampRow(name, 'training', date, { event: `${supplier} partner training`, supplier, format: 'virtual', location: '' }))
        })
      } else if (kind.includes('fair')) {
        take(FAIR_DAYS, n, 'fairs').forEach((date, i) => rows.push(stampRow(name, 'fair', date, { event: `Supplier fair ${i + 1}` })))
      } else {
        take(HUB_DAYS, n, 'Hub days').forEach((date, i) => {
          const course = HUB_COURSES[i]
          rows.push(stampRow(name, 'hub', date, { event: course.event, supplier: course.supplier }))
        })
      }
    } else if (/^(club express )?fall$/.test(part)) rows.push(stampRow(name, 'club', FALL.date))
    else if (/^(club express )?spring$/.test(part)) rows.push(stampRow(name, 'club', SPRING.date))
    else if (part === 'quota') rows.push(stampRow(name, 'quota', DEMO_TODAY))
    else throw new Error(`test-helpers: no idea what “${part}” means`)
  }
  return rows
}

export interface Who {
  did?: string // the story, as stampsFor reads it
  team?: string
  start?: string
}
export type Cast = Record<string, string | Who>

// A whole sheet: each rep's story, plus any hand-made stamps.
export function sheet(cast: Cast, extra: StampRow[] = []): PassportData {
  const reps: RepRow[] = []
  const stamps: StampRow[] = []
  for (const [name, entry] of Object.entries(cast)) {
    const who = typeof entry === 'string' ? { did: entry } : entry
    reps.push(repRow(name, who.team, who.start))
    stamps.push(...stampsFor(name, who.did ?? ''))
  }
  return { reps, stamps: [...stamps, ...extra] }
}

export const modelOf = (cast: Cast, extra: StampRow[] = []): Model => buildModel(sheet(cast, extra))

export function repOf(model: Model, name: string): Rep {
  const rep = findRep(model, idOf(name))
  if (!rep) throw new Error(`test-helpers: ${name} isn’t in this model`)
  return rep
}

// One rep's stats from a story, on the demo's today unless you say otherwise.
export function statsOf(story: string | Who, ctx: Context = TODAY, extra: (name: string) => StampRow[] = () => []): RepStats {
  const model = modelOf({ Ana: story }, extra('Ana'))
  return repStats(model, repOf(model, 'Ana'), ctx)
}

// A board row with only the numbers the podium, the line and the figures
// read. Progress is left at zero: nothing that reads these rows looks at it.
export function fakeRow(
  name: string,
  rank: number,
  { met = 3, total = 12, team = 'POSB', tied = false, activitiesDone = false }: Partial<{ met: number; total: number; team: string; tied: boolean; activitiesDone: boolean }> = {},
): StandingRow {
  const progress = Object.fromEntries(
    ACTIVITIES.map((activity) => [activity, { activity, stamps: [], counted: 0, minimum: 1, met: false, short: 1, reachable: true }]),
  ) as unknown as RepStats['progress']
  const qualified = met === ACTIVITIES.length
  const stats: RepStats = { progress, met, total, activitiesDone: activitiesDone || qualified, qualified, outOfReach: [] }
  return {
    rep: { id: name.toLowerCase(), email: emailOf(name), name, team, start: '' },
    stats,
    status: statusOf(stats),
    rank,
    tied,
    change: { kind: 'none' },
    above: qualified,
  }
}
