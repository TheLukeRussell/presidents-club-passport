// The qualifying rules: what each stamp counts toward, which minimums a rep
// has met, and which ones can't be met any more. Pure functions, no React.

import { ACTIVITIES, CLUB_EXPRESS, MINIMUMS, QUOTA_DATE, type Activity } from '../config'
import { stampsOf, type Model, type Rep, type Stamp } from './model'

export interface Context {
  today: string // YYYY-MM-DD
}

export interface Progress {
  activity: Activity
  stamps: Stamp[] // this activity's stamps, in date order
  counted: number // what counts toward the minimum: in-person sessions for trainings
  minimum: number
  met: boolean
  short: number // how many more it takes, 0 once met
  // False once the minimum can't be met this year: a Club Express event
  // that's been and gone without them, or quota after the year closes.
  reachable: boolean
}

export interface RepStats {
  progress: Record<Activity, Progress>
  met: number // minimums met, 0 to 5
  total: number // every stamp, the gold seal included
  activitiesDone: boolean // all four besides quota
  qualified: boolean // all five
  outOfReach: Activity[]
}

// Stamps dated after today haven't happened yet, so they don't count.
export function countedStamps(model: Model, rep: Rep, ctx: Context): Stamp[] {
  return stampsOf(model, rep).filter((stamp) => stamp.date <= ctx.today)
}

// The Club Express events that have been and gone without this rep. A stamp
// matches an event by its name or its date, so "Club Express Fall" typed
// without the comma still counts. Someone who started after an event missed
// it too: the rule is both.
const squash = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, '')
export function clubEventsMissed(stamps: Stamp[], ctx: Context): string[] {
  return CLUB_EXPRESS.filter(
    (event) =>
      event.date < ctx.today &&
      !stamps.some((s) => s.activity === 'club' && (s.date === event.date || squash(s.event) === squash(event.title))),
  ).map((event) => event.title)
}

function progressOf(activity: Activity, all: Stamp[], ctx: Context): Progress {
  const stamps = all.filter((s) => s.activity === activity)
  const counted = activity === 'training' ? stamps.filter((s) => s.format === 'in person').length : stamps.length
  const minimum = MINIMUMS[activity]
  const met = counted >= minimum
  let reachable = true
  if (!met && activity === 'club') reachable = clubEventsMissed(all, ctx).length === 0
  if (!met && ctx.today > QUOTA_DATE) reachable = false
  return { activity, stamps, counted, minimum, met, short: Math.max(minimum - counted, 0), reachable }
}

export function repStats(model: Model, rep: Rep, ctx: Context): RepStats {
  const all = countedStamps(model, rep, ctx)
  const progress = Object.fromEntries(ACTIVITIES.map((a) => [a, progressOf(a, all, ctx)])) as Record<Activity, Progress>
  const met = ACTIVITIES.filter((a) => progress[a].met).length
  const activitiesDone = ACTIVITIES.every((a) => a === 'quota' || progress[a].met)
  return {
    progress,
    met,
    total: all.length,
    activitiesDone,
    qualified: met === ACTIVITIES.length,
    outOfReach: ACTIVITIES.filter((a) => !progress[a].reachable),
  }
}

// What's still missing, in activity order. Quota is in here too: it's the
// one a rep can't schedule.
export function stillNeeded(stats: RepStats): Progress[] {
  return ACTIVITIES.map((a) => stats.progress[a]).filter((p) => !p.met)
}

export type Status = 'qualified' | 'on-track' | 'out-of-reach' | 'to-go'

// One word for where a rep stands. On track means every activity is done and
// only the quota result is left to come.
export function statusOf(stats: RepStats): Status {
  if (stats.qualified) return 'qualified'
  if (stats.outOfReach.length) return 'out-of-reach'
  if (stats.activitiesDone) return 'on-track'
  return 'to-go'
}

// The latest day anyone earned a stamp, up to today. Standings measures
// "change" against the board as it stood the day before.
export function lastStampDay(model: Model, ctx: Context): string | null {
  for (let i = model.stamps.length - 1; i >= 0; i--) {
    if (model.stamps[i].date <= ctx.today) return model.stamps[i].date
  }
  return null
}
