// The words for where a rep stands. The data page gets a head and a line under
// it, the activity pages get an endorsement once the demo records something,
// and the board and checklist get short labels. Kept here so the wording
// follows the rules exactly and the tests can check it.

import { ACTIVITIES, CLUB_EXPRESS, PROGRAM_YEAR, QUOTA_DATE, type Activity } from '../config'
import { longDate, stampDate } from './format'
import type { Stamp } from './model'
import { clubEventsMissed, stillNeeded, type Context, type Progress, type RepStats, type Status } from './rules'

const NBSP = ' '
const WORDS = ['None', 'One', 'Two', 'Three', 'Four', 'Five']
const nb = (text: string) => text.replace(/ /g, NBSP)

// "a, b and c"
export function joinAnd(items: string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`
}

// Quota results come in once the fiscal year closes.
export const quotaWhen = () => `Quota results land ${longDate(QUOTA_DATE).replace(/, \d{4}$/, '')}`

// What one unmet minimum still takes, as a phrase: "2 more in-person
// trainings", "1 more fair", "Club Express Spring".
export function needPhrase(p: Progress, ctx: Context): string {
  const n = p.short
  switch (p.activity) {
    case 'training':
      return `${n} more in-person training${n === 1 ? '' : 's'}`
    case 'fair':
      return `${n} more fair${n === 1 ? '' : 's'}`
    case 'hub':
      return `${n} more Hub course${n === 1 ? '' : 's'}`
    case 'club': {
      if (n === 2) return 'both Club Express events'
      // Name the one still to come, when the calendar has it.
      const next = CLUB_EXPRESS.find((e) => e.date >= ctx.today && !p.stamps.some((s) => s.date === e.date))
      return next ? next.title : '1 more Club Express event'
    }
    case 'quota':
      return 'the quota'
  }
}

// Progress on one minimum, as the checklist and the board print it. Extras
// past the minimum don't show here: 6 in-person trainings reads "4 of 4".
export const countOf = (p: Progress) => `${Math.min(p.counted, p.minimum)} of ${p.minimum}`

export function progressLabel(p: Progress): string {
  if (p.activity === 'quota') return p.met ? 'Achieved' : 'Not yet'
  const of = countOf(p)
  return p.activity === 'training' ? `${of} in person` : of
}

// One or two words for the board's Status column.
export function statusWord(status: Status, stats: RepStats): string {
  switch (status) {
    case 'qualified':
      return 'Qualified'
    case 'on-track':
      return 'On track'
    case 'out-of-reach':
      return 'Out of reach'
    case 'to-go':
      return `${ACTIVITIES.length - stats.met} to go`
  }
}

// The data page's message: a head, and a line under it saying what's left.
export function lineMessage(stats: RepStats, ctx: Context): { head: string; sub: string } {
  if (stats.qualified) {
    return { head: 'Qualified for President’s Club', sub: `All five minimums met. See you on the trip in ${PROGRAM_YEAR + 1}.` }
  }
  if (stats.outOfReach.includes('club')) {
    const missed = clubEventsMissed(stats.progress.club.stamps, ctx)
    return {
      head: 'Out of reach this year',
      sub: `Club Express takes both events, and ${joinAnd(missed)} ${missed.length === 1 ? 'has' : 'have'} passed.`,
    }
  }
  if (stats.outOfReach.length) {
    return { head: 'Out of reach this year', sub: 'The year closed before every minimum was met.' }
  }
  if (stats.activitiesDone) {
    return { head: 'All four activities done', sub: `${quotaWhen()}.` }
  }
  const needs = stillNeeded(stats).filter((p) => p.activity !== 'quota')
  const left = ACTIVITIES.length - stats.met
  return {
    head: `${WORDS[left]} to go`,
    sub: `${capital(joinAnd(needs.map((p) => needPhrase(p, ctx))))}.${stats.progress.quota.met ? '' : ` ${quotaWhen()}.`}`,
  }
}

const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

// Short name for each activity's count in an endorsement.
const COUNT_NAMES: Record<Activity, string> = {
  training: 'In person',
  fair: 'Fairs',
  hub: 'Hub',
  club: 'Club Express',
  quota: 'Quota',
}

// Where the rep stands overall, for the end of an endorsement.
function overall(stats: RepStats): string {
  if (stats.qualified) return 'Qualified for President’s Club'
  if (stats.activitiesDone) return 'All four activities done'
  return `${stats.met} of ${ACTIVITIES.length} met`
}

// Written on an activity page once the demo records a stamp there, like an
// officer's note: the date, the count on this page, and where that leaves you.
// Non-breaking spaces keep "17 JUN 2027" and "2 of 2" from splitting.
export function endorsement(stamp: Stamp, stats: RepStats): string {
  const p = stats.progress[stamp.activity]
  if (stamp.activity === 'quota') return `Sealed ${nb(stampDate(stamp.date))}. ${overall(stats)}.`
  const count = `${COUNT_NAMES[stamp.activity]} ${nb(countOf(p))}${p.met ? ', done' : ''}`
  return `Stamped ${nb(stampDate(stamp.date))}. ${count}. ${overall(stats)}.`
}
