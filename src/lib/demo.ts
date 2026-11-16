// Demo-only logic: what the Record buttons stamp, who else gets the same
// stamp, and which rep the demo opens as. Pure, so the tests can pin it down.

import { DEMO_EVENTS, HUB_COURSES, type Activity } from '../config'
import type { StampRow } from '../data/types'
import { findRep, stampsOf, type Model, type Rep } from './model'
import { unitFor } from './random'
import { repStats, type Context } from './rules'

// Trainings, fairs and Club Express happen in a room full of reps. A Hub
// course and the quota are one rep's own.
export const GROUP_EVENTS: readonly Activity[] = ['training', 'fair', 'club']

// The stamp Record gives this rep for an activity, dated today, or null when
// there's nothing to give: they already have today's, every Hub course is
// done, or the gold seal is already in.
export function demoStamp(model: Model, rep: Rep, activity: Activity, ctx: Context): StampRow | null {
  const have = stampsOf(model, rep)
  let row: StampRow
  if (activity === 'hub') {
    const course = HUB_COURSES.find((c) => !have.some((s) => s.activity === 'hub' && s.event === c.event))
    if (!course) return null
    row = { rep_email: rep.email, activity, event: course.event, supplier: course.supplier, date: ctx.today, format: '', location: '' }
  } else {
    if (activity === 'quota' && have.some((s) => s.activity === 'quota')) return null
    const e = DEMO_EVENTS[activity]
    row = { rep_email: rep.email, activity, event: e.event, supplier: e.supplier, date: ctx.today, format: e.format, location: e.location }
  }
  if (have.some((s) => s.activity === activity && s.date === row.date && s.event === row.event)) return null
  return row
}

// Who gets stamped when Record runs: the rep, plus for a group event one
// seeded coin flip for everyone else, so the same reps show up every time.
export function pickAttendees(model: Model, activity: Activity, rep: Rep, share: number, seed: number, ctx: Context): string[] {
  if (!GROUP_EVENTS.includes(activity)) return [rep.email]
  return model.reps
    .filter((r) => r.email === rep.email || (unitFor(`${r.email}|${activity}`, seed) < share && (!r.start || r.start <= ctx.today)))
    .filter((r) => demoStamp(model, r, activity, ctx) !== null)
    .map((r) => r.email)
    .sort()
}

// Every stamp a recording adds, given who it went to.
export function demoStamps(model: Model, activity: Activity, emails: readonly string[], ctx: Context): StampRow[] {
  const byEmail = new Map(model.reps.map((r) => [r.email, r]))
  return emails
    .map((email) => byEmail.get(email))
    .filter((rep): rep is Rep => Boolean(rep))
    .map((rep) => demoStamp(model, rep, activity, ctx))
    .filter((row): row is StampRow => row !== null)
}

// Open the demo as `preferred` (DEMO_REP in config) when they're in the data,
// so a bigger file doesn't swap the demo over to someone else. Otherwise
// whoever has the most to do and could still qualify, which shows off the
// most Record buttons.
export function pickDefaultRep(model: Model, ctx: Context, preferred?: string): Rep | undefined {
  const pinned = preferred ? findRep(model, preferred) : undefined
  if (pinned) return pinned
  const candidates = model.reps
    .map((rep) => ({ rep, stats: repStats(model, rep, ctx) }))
    .filter(({ stats }) => stats.outOfReach.length === 0)
    .sort((a, b) => a.stats.met - b.stats.met || b.stats.total - a.stats.total || a.rep.name.localeCompare(b.rep.name))
  return candidates[0]?.rep ?? model.reps[0]
}
