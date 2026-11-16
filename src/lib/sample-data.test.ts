// Checks the sample file still tells the story the demo leans on. It reads
// public/data/passport.json the way the app does, through cleanData and
// buildModel. If someone tweaks the data script and breaks the story, this
// goes red.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ACTIVITIES, CLUB_EXPRESS, DEMO_REP, DEMO_SEED, DEMO_SHARE, DEMO_TODAY, EXPIRY_DATE, HUB_COURSES, ISSUE_DATE, SLOTS, SUPPLIERS, TEAMS, type Activity } from '../config'
import { demoStamps, pickAttendees, pickDefaultRep } from './demo'
import { lineMessage } from './messages'
import { buildModel, findRep, stampsOf, withStamps, type Model, type Rep } from './model'
import { changeFor, figuresFor, lineIndex, standings } from './ranking'
import { repStats, type Context } from './rules'
import { cleanData } from './sheet'

const raw = JSON.parse(readFileSync(join(process.cwd(), 'public/data/passport.json'), 'utf8'))
const cleaned = cleanData(raw.reps, raw.stamps)
const model = buildModel(cleaned.data)
const ctx: Context = { today: DEMO_TODAY }
const board = standings(model, ctx)
const rowOf = (rows: typeof board, name: string) => rows.find((r) => r.rep.name === name)!
const repNamed = (name: string) => model.reps.find((r) => r.name === name)!
const hannah = findRep(model, DEMO_REP)!

// The demo panel's Record buttons, pressed in this order on `rep`'s passport.
// This mirrors AppState: it remembers who each recording went to, and
// rebuilds the model from the sheet with every recording on top.
function record(rep: Rep, activities: readonly Activity[]) {
  const recorded: Partial<Record<Activity, string[]>> = {}
  const rebuild = () => {
    let next: Model = model
    for (const a of ACTIVITIES) {
      const emails = recorded[a]
      if (emails) next = withStamps(next, demoStamps(model, a, emails, ctx))
    }
    return next
  }
  for (const activity of activities) recorded[activity] = pickAttendees(rebuild(), activity, rep, DEMO_SHARE, DEMO_SEED, ctx)
  const after = rebuild()
  return { recorded, model: after, board: standings(after, ctx) }
}

describe('sample data', () => {
  it('comes through the sheet cleaner without a single note', () => {
    expect(cleaned.problems).toEqual([])
    expect(cleaned.data.reps).toHaveLength(raw.reps.length)
    expect(cleaned.data.stamps).toHaveLength(raw.stamps.length)
  })

  it('has 60 reps, 12 on each of the five teams', () => {
    expect(model.reps).toHaveLength(60)
    for (const team of TEAMS) expect(model.reps.filter((r) => r.team === team), team).toHaveLength(12)
  })

  it('only uses example.com emails, listed suppliers and catalog Hub courses', () => {
    expect(model.reps.every((r) => r.email.endsWith('@example.com'))).toBe(true)
    const suppliers = new Set<string>(SUPPLIERS)
    for (const s of model.stamps.filter((s) => s.activity === 'training' || s.activity === 'hub')) expect(suppliers.has(s.supplier), s.supplier).toBe(true)
    const courses = new Set<string>(HUB_COURSES.map((c) => c.event))
    expect(model.stamps.filter((s) => s.activity === 'hub').every((s) => courses.has(s.event))).toBe(true)
  })

  it('has nothing stamped today or later, and every stamp inside the fiscal year', () => {
    expect(model.stamps.filter((s) => s.date >= DEMO_TODAY)).toEqual([])
    expect(model.stamps.every((s) => s.date >= ISSUE_DATE && s.date <= EXPIRY_DATE)).toBe(true)
  })

  it('has no stamps from before a rep started, and no quota results yet', () => {
    for (const rep of model.reps.filter((r) => r.start)) {
      expect(stampsOf(model, rep).every((s) => s.date >= rep.start), rep.name).toBe(true)
    }
    expect(model.stamps.some((s) => s.activity === 'quota')).toBe(false)
  })

  it('gives every team at least five in-person trainings, so four is fair to all', () => {
    for (const team of TEAMS) {
      const emails = new Set(model.reps.filter((r) => r.team === team).map((r) => r.email))
      const events = new Set(model.stamps.filter((s) => emails.has(s.email) && s.activity === 'training' && s.format === 'in person').map((s) => s.id))
      expect(events.size, team).toBeGreaterThanOrEqual(5)
    }
  })

  it('has every training marked in person or virtual, and only Club Express Fall so far', () => {
    expect(model.stamps.filter((s) => s.activity === 'training').every((s) => s.format === 'in person' || s.format === 'virtual')).toBe(true)
    expect(new Set(model.stamps.filter((s) => s.activity === 'club').map((s) => s.event))).toEqual(new Set([CLUB_EXPRESS[0].title]))
  })

  it('has nobody qualified and nobody with every activity done before any Record', () => {
    expect(figuresFor(board)).toMatchObject({ qualified: 0, activitiesDone: 0, reps: 60 })
    expect(lineIndex(board)).toBe(0)
    expect(board.some((r) => r.status === 'on-track' || r.status === 'qualified')).toBe(false)
  })

  it('has Jordan Hale in first with the most stamps, and Marcus Bell and Priya Natarajan tied for 2nd', () => {
    const jordan = rowOf(board, 'Jordan Hale')
    expect(jordan).toMatchObject({ rank: 1, tied: false })
    expect(jordan.stats.total).toBe(Math.max(...board.map((r) => r.stats.total)))
    expect(board.slice(1, 3).map((r) => [r.rep.name, r.rank, r.tied])).toEqual([
      ['Marcus Bell', 2, true],
      ['Priya Natarajan', 2, true],
    ])
    expect(rowOf(board, 'Marcus Bell').stats).toMatchObject({ met: rowOf(board, 'Priya Natarajan').stats.met, total: rowOf(board, 'Priya Natarajan').stats.total })
    expect(board[3].rank).toBe(4)
  })

  it('has six reps out of reach, each for missing Club Express Fall', () => {
    const out = board.filter((r) => r.status === 'out-of-reach')
    expect(out.map((r) => r.rep.name).sort()).toEqual(['Chloe Whitaker', 'Clara Dubois', 'Cole Ashby', 'Jonah Becker', 'Nadia Kerr', 'Yuki Tanaka'])
    for (const row of out) {
      expect(row.stats.outOfReach, row.rep.name).toEqual(['club'])
      expect(lineMessage(row.stats, ctx).sub).toBe('Club Express takes both events, and Club Express Fall has passed.')
    }
  })

  it('has Clara Dubois as a June 1 new hire who started after Club Express Fall', () => {
    const clara = rowOf(board, 'Clara Dubois')
    expect(clara.rep).toMatchObject({ team: 'Federal', start: '2027-06-01' })
    expect(clara.rep.start > CLUB_EXPRESS[0].date).toBe(true)
    expect(clara.status).toBe('out-of-reach')
    expect(clara.rank).toBe(60)
  })
})

describe('Hannah, the demo rep', () => {
  const row = rowOf(board, 'Hannah Kowalski')

  it('is who the demo opens as', () => {
    expect(pickDefaultRep(model, ctx, DEMO_REP)?.id).toBe(DEMO_REP)
    expect(row.rep.team).toBe('Communications')
  })

  it('has 0 of 5 met from six stamps: 3 in person, 1 fair, 1 Hub course and Club Express Fall', () => {
    expect(row.stats).toMatchObject({ met: 0, total: 6, activitiesDone: false, qualified: false, outOfReach: [] })
    const count = (a: Activity) => row.stats.progress[a].stamps.length
    expect(ACTIVITIES.map((a) => [a, count(a)])).toEqual([
      ['training', 3],
      ['fair', 1],
      ['hub', 1],
      ['club', 1],
      ['quota', 0],
    ])
    expect(row.stats.progress.training.counted).toBe(3)
    expect(row.stats.progress.club.stamps[0].event).toBe(CLUB_EXPRESS[0].title)
    expect(row.status).toBe('to-go')
  })

  it('reads “Five to go” with every Record button still to use', () => {
    expect(lineMessage(row.stats, ctx)).toEqual({
      head: 'Five to go',
      sub: '1 more in-person training, 1 more fair, 1 more Hub course and Club Express Spring. Quota results land June 30.',
    })
  })

  it('has an open slot on every activity page, so each Record lands a stamp in one', () => {
    for (const activity of Object.keys(SLOTS) as (keyof typeof SLOTS)[]) {
      expect(row.stats.progress[activity].stamps.length, activity).toBeLessThan(SLOTS[activity])
      expect(row.stats.progress[activity].stamps.length + 1, activity).toBe(SLOTS[activity])
    }
  })

  it('starts 53rd, tied', () => {
    expect(row).toMatchObject({ rank: 53, tied: true })
  })
})

describe('Record', () => {
  it('stamps Jordan, Marcus and Priya at every group event today', () => {
    for (const activity of ['training', 'fair', 'club'] as const) {
      const emails = pickAttendees(model, activity, hannah, DEMO_SHARE, DEMO_SEED, ctx)
      for (const name of ['Jordan Hale', 'Marcus Bell', 'Priya Natarajan']) expect(emails, `${name} ${activity}`).toContain(repNamed(name).email)
      expect(emails).toContain(hannah.email)
    }
  })

  it('takes activities done from 0 to 18 on Club Express alone', () => {
    const after = record(hannah, ['club'])
    expect(figuresFor(after.board)).toMatchObject({ qualified: 0, activitiesDone: 18 })
    expect(after.recorded.club).toHaveLength(45)
    // Hannah isn't one of the 18: she's still short on everything else.
    expect(rowOf(after.board, 'Hannah Kowalski').stats.activitiesDone).toBe(false)
  })

  it('stamps only Hannah for a Hub course or the quota', () => {
    const after = record(hannah, ['hub', 'quota'])
    expect(after.recorded).toEqual({ hub: [hannah.email], quota: [hannah.email] })
    const stats = rowOf(after.board, 'Hannah Kowalski').stats
    expect(stats.progress.hub.stamps.map((s) => s.event)).toContain(HUB_COURSES[0].event)
    expect(stats.progress.quota.met).toBe(true)
  })

  it('moves Hannah up a little more with each button, and makes her qualified and first with all five', () => {
    const steps = ACTIVITIES.map((_, i) => rowOf(record(hannah, ACTIVITIES.slice(0, i + 1)).board, 'Hannah Kowalski'))
    expect(steps.map((r) => [r.stats.met, r.stats.total, r.status])).toEqual([
      [1, 7, 'to-go'],
      [2, 8, 'to-go'],
      [3, 9, 'to-go'],
      [4, 10, 'on-track'],
      [5, 11, 'qualified'],
    ])
    expect(steps.map((r) => r.rank)).toEqual([50, 45, 27, 21, 1])
    expect(steps.at(-1)).toMatchObject({ rank: 1, tied: false, above: true, change: { kind: 'up', places: 52 } })
    const all = record(hannah, ACTIVITIES)
    expect(figuresFor(all.board)).toMatchObject({ qualified: 1, activitiesDone: 21 })
    expect(lineIndex(all.board)).toBe(1)
    expect(lineMessage(steps.at(-1)!.stats, ctx).head).toBe('Qualified for President’s Club')
  })

  it('never stamps anyone who hadn’t started by today', () => {
    const after = record(hannah, ACTIVITIES)
    const late = new Set(model.reps.filter((r) => r.start > DEMO_TODAY).map((r) => r.email))
    for (const emails of Object.values(after.recorded)) expect(emails!.filter((e) => late.has(e))).toEqual([])
  })

  it('dates every stamp today, so the change column measures from the board before Record', () => {
    const after = record(hannah, ['club'])
    expect(after.model.stamps.filter((s) => s.date === DEMO_TODAY)).toHaveLength(45)
    const before = new Map(board.map((r) => [r.rep.id, r.rank]))
    for (const row of after.board) expect(row.change, row.rep.name).toEqual(changeFor(row.rank, before.get(row.rep.id), true))
  })

  it('leaves the rest of the year’s history alone', () => {
    const after = record(hannah, ACTIVITIES)
    expect(after.model.stamps.filter((s) => s.date < DEMO_TODAY)).toEqual(model.stamps)
    for (const rep of model.reps) {
      const before = repStats(model, rep, ctx)
      const now = repStats(after.model, rep, ctx)
      expect(now.total, rep.name).toBeGreaterThanOrEqual(before.total)
      expect(now.met, rep.name).toBeGreaterThanOrEqual(before.met)
    }
  })
})
