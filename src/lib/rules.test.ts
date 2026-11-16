// Tests for the qualifying rules: what counts, which minimums are met, what's
// out of reach, and the one-word status.

import { describe, expect, it } from 'vitest'
import { ACTIVITIES, CLUB_EXPRESS, DEMO_TODAY, MINIMUMS, QUOTA_DATE } from '../config'
import { buildModel } from './model'
import { clubEventsMade, clubEventsMissed, countedStamps, countingStamps, lastStampDay, repStats, statusOf, stillNeeded } from './rules'
import { modelOf, repOf, sheet, stampRow, statsOf, TODAY } from './test-helpers'

const [FALL, SPRING] = CLUB_EXPRESS
// Everything it takes, quota included.
const ALL = '4 in person, 2 fairs, 2 hub, fall, spring, quota'

describe('the minimums', () => {
  it('match the brief', () => {
    expect(MINIMUMS).toEqual({ training: 4, fair: 2, hub: 2, club: 2, quota: 1 })
    expect(ACTIVITIES).toEqual(['training', 'fair', 'hub', 'club', 'quota'])
  })
})

describe('trainings', () => {
  it('count only in-person sessions toward the minimum, though every one is a stamp', () => {
    const { progress, total } = statsOf('3 in person, 5 virtual')
    expect(progress.training).toMatchObject({ counted: 3, minimum: 4, met: false, short: 1 })
    expect(progress.training.stamps).toHaveLength(8)
    expect(total).toBe(8)
  })

  it('meet the minimum at four in person, with extras still counted', () => {
    expect(statsOf('4 in person').progress.training).toMatchObject({ counted: 4, met: true, short: 0 })
    expect(statsOf('6 in person, 2 virtual').progress.training).toMatchObject({ counted: 6, met: true, short: 0 })
  })

  it('never meet the minimum on virtual sessions alone', () => {
    expect(statsOf('6 virtual').progress.training).toMatchObject({ counted: 0, met: false, short: 4 })
  })

  it('treat a training with no format as virtual', () => {
    const stats = statsOf('3 in person', TODAY, (name) => [stampRow(name, 'training', '2027-05-26', { format: '' })])
    expect(stats.progress.training).toMatchObject({ counted: 3, met: false })
    expect(stats.total).toBe(4)
  })
})

describe('repStats', () => {
  it('counts each minimum on its own', () => {
    const stats = statsOf('3 in person, 1 virtual, 2 fairs, 1 hub, fall')
    expect(ACTIVITIES.map((a) => [a, stats.progress[a].counted, stats.progress[a].met])).toEqual([
      ['training', 3, false],
      ['fair', 2, true],
      ['hub', 1, false],
      ['club', 1, false],
      ['quota', 0, false],
    ])
    expect(stats).toMatchObject({ met: 1, total: 8, activitiesDone: false, qualified: false, outOfReach: [] })
  })

  it('has activities done once all four are met, and qualified with the quota too', () => {
    expect(statsOf('4 in person, 2 fairs, 2 hub, fall, spring')).toMatchObject({ met: 4, activitiesDone: true, qualified: false })
    expect(statsOf(ALL)).toMatchObject({ met: 5, total: 11, activitiesDone: true, qualified: true })
  })

  it('counts the gold seal as a stamp, and once is enough', () => {
    expect(statsOf('quota').progress.quota).toMatchObject({ counted: 1, minimum: 1, met: true })
    expect(statsOf('quota').total).toBe(1)
  })

  it('starts the year at zero, with nothing out of reach', () => {
    expect(statsOf('', { today: '2026-07-01' })).toMatchObject({ met: 0, total: 0, activitiesDone: false, qualified: false, outOfReach: [] })
  })

  it('ignores stamps dated after today', () => {
    const later = (name: string) => [stampRow(name, 'fair', '2027-06-20'), stampRow(name, 'hub', '2027-06-25')]
    const stats = statsOf('1 fair', TODAY, later)
    expect(stats.progress.fair.counted).toBe(1)
    expect(stats.total).toBe(1)
    // The same stamps count once their day comes.
    expect(statsOf('1 fair', { today: '2027-06-25' }, later).total).toBe(3)
  })
})

describe('countedStamps', () => {
  it('keeps today’s stamps and drops tomorrow’s', () => {
    const model = buildModel(sheet({ Ana: '' }, [stampRow('Ana', 'club', SPRING.date), stampRow('Ana', 'fair', '2027-06-18')]))
    expect(countedStamps(model, repOf(model, 'Ana'), TODAY).map((s) => s.activity)).toEqual(['club'])
  })
})

describe('Club Express', () => {
  it('stays reachable while both events are still to come', () => {
    const before = { today: '2026-10-01' }
    expect(statsOf('', before).progress.club).toMatchObject({ met: false, reachable: true, short: 2 })
  })

  it('stays reachable on the day of an event a rep isn’t stamped for yet', () => {
    expect(statsOf('fall', { today: SPRING.date }).progress.club.reachable).toBe(true)
    expect(statsOf('', { today: FALL.date }).progress.club.reachable).toBe(true)
  })

  it('goes out of reach once an event has passed without them', () => {
    const stats = statsOf('4 in person, 2 fairs, 2 hub')
    expect(stats.progress.club).toMatchObject({ met: false, reachable: false })
    expect(stats.outOfReach).toEqual(['club'])
    expect(statusOf(stats)).toBe('out-of-reach')
  })

  it('is out of reach for a new hire who started after the fall event', () => {
    const stats = statsOf({ start: '2027-06-01' })
    expect(stats.outOfReach).toEqual(['club'])
    expect(statusOf(stats)).toBe('out-of-reach')
  })

  it('matches a stamp to its event by name or by date', () => {
    const byName = [stampRow('Ana', 'club', '2026-10-15', { event: 'Club Express, Fall' })]
    const byDate = [stampRow('Ana', 'club', FALL.date, { event: 'Greenville kickoff' })]
    const other = [stampRow('Ana', 'club', '2026-10-15', { event: 'Regional kickoff' })]
    const stampsOf = (rows: ReturnType<typeof stampRow>[]) => buildModel({ reps: sheet({ Ana: '' }).reps, stamps: rows }).stamps
    expect(clubEventsMissed(stampsOf(byName), TODAY)).toEqual([])
    expect(clubEventsMissed(stampsOf(byDate), TODAY)).toEqual([])
    expect(clubEventsMissed(stampsOf(other), TODAY)).toEqual([FALL.title])
  })

  it('names every event that has passed without them', () => {
    expect(clubEventsMissed([], { today: '2027-06-18' })).toEqual([FALL.title, SPRING.title])
    expect(clubEventsMissed([], TODAY)).toEqual([FALL.title])
    expect(clubEventsMissed([], { today: FALL.date })).toEqual([])
  })

  it('never counts another activity’s stamp from the same day', () => {
    const stats = statsOf('', TODAY, (name) => [stampRow(name, 'fair', FALL.date)])
    expect(stats.progress.club.reachable).toBe(false)
  })

  // Fall typed in twice, a day apart, is still one event: Spring is missing.
  it('counts events, not stamps, so a duplicate row can’t meet it', () => {
    const twice = (name: string) => [stampRow(name, 'club', '2026-10-15', { event: 'Club Express Fall' })]
    const stats = statsOf('fall', TODAY, twice)
    expect(stats.progress.club).toMatchObject({ counted: 1, met: false, short: 1, reachable: true })
    expect(stats.progress.club.stamps).toHaveLength(2)
    expect(stats.total).toBe(2)
    expect(statsOf('fall, spring', TODAY, twice).progress.club).toMatchObject({ counted: 2, met: true })
  })

  it('doesn’t count a stamp that matches neither event', () => {
    const stats = statsOf('spring', TODAY, (name) => [stampRow(name, 'club', '2026-10-15', { event: 'Regional kickoff' })])
    expect(stats.progress.club).toMatchObject({ counted: 1, met: false, reachable: false })
    expect(stats.outOfReach).toEqual(['club'])
  })

  // Named Fall but dated on Spring's day: one stamp, one event.
  it('lets one stamp stand for one event only', () => {
    const odd = [stampRow('Ana', 'club', SPRING.date, { event: 'Club Express Fall' })]
    const stamps = buildModel({ reps: sheet({ Ana: '' }).reps, stamps: odd }).stamps
    expect(clubEventsMade(stamps)).toEqual([FALL.title])
    expect(clubEventsMissed(stamps, { today: '2027-06-18' })).toEqual([SPRING.title])
  })
})

describe('clubEventsMade', () => {
  it('lists the events made, in calendar order', () => {
    const model = modelOf({ Ana: 'spring, fall', Ben: 'fall', Cy: '' })
    const made = (name: string) => clubEventsMade(model.byRep.get(repOf(model, name).email) ?? [])
    expect(made('Ana')).toEqual([FALL.title, SPRING.title])
    expect(made('Ben')).toEqual([FALL.title])
    expect(made('Cy')).toEqual([])
  })
})

describe('countingStamps', () => {
  it('keeps what counts toward each minimum, in date order', () => {
    const model = modelOf({ Ana: '2 in person, 2 virtual, 1 fair, fall, spring' }, [stampRow('Ana', 'club', '2026-10-15', { event: 'Club Express Fall' })])
    const stamps = model.byRep.get(repOf(model, 'Ana').email)!
    expect(countingStamps('training', stamps).map((s) => s.format)).toEqual(['in person', 'in person'])
    expect(countingStamps('fair', stamps)).toHaveLength(1)
    expect(countingStamps('club', stamps).map((s) => s.date)).toEqual([FALL.date, SPRING.date])
    expect(countingStamps('hub', stamps)).toEqual([])
  })
})

describe('the quota', () => {
  it('stays reachable until the year closes', () => {
    expect(statsOf('').progress.quota.reachable).toBe(true)
    expect(statsOf('', { today: QUOTA_DATE }).progress.quota.reachable).toBe(true)
  })

  it('puts every unmet minimum out of reach once the year has closed', () => {
    const stats = statsOf('4 in person, 2 fairs, 2 hub, fall, spring', { today: '2027-07-01' })
    expect(stats.outOfReach).toEqual(['quota'])
    expect(statusOf(stats)).toBe('out-of-reach')
    expect(statsOf('2 fairs', { today: '2027-07-01' }).outOfReach).toEqual(['training', 'hub', 'club', 'quota'])
  })
})

describe('statusOf', () => {
  it('reads qualified, on track, out of reach or to go', () => {
    expect(statusOf(statsOf(ALL))).toBe('qualified')
    expect(statusOf(statsOf('4 in person, 2 fairs, 2 hub, fall, spring'))).toBe('on-track')
    expect(statusOf(statsOf('4 in person, 2 fairs, 2 hub'))).toBe('out-of-reach')
    expect(statusOf(statsOf('3 in person, 1 fair, 1 hub, fall'))).toBe('to-go')
    // The quota alone doesn't make a rep on track.
    expect(statusOf(statsOf('quota, fall'))).toBe('to-go')
  })
})

describe('stillNeeded', () => {
  it('lists the unmet minimums in activity order, quota included', () => {
    expect(stillNeeded(statsOf('4 in person, 1 fair, fall')).map((p) => p.activity)).toEqual(['fair', 'hub', 'club', 'quota'])
    expect(stillNeeded(statsOf(ALL))).toEqual([])
  })
})

describe('lastStampDay', () => {
  it('is the latest stamp up to today', () => {
    const model = modelOf({ Ana: '2 fairs', Ben: '1 hub' }, [stampRow('Ben', 'fair', '2027-06-20')])
    expect(lastStampDay(model, TODAY)).toBe('2026-12-03')
    expect(lastStampDay(model, { today: '2027-06-30' })).toBe('2027-06-20')
    expect(lastStampDay(model, { today: '2026-07-01' })).toBeNull()
  })

  it('is today once something is stamped today', () => {
    const model = modelOf({ Ana: '2 fairs, spring' })
    expect(lastStampDay(model, TODAY)).toBe(DEMO_TODAY)
  })

  it('is null with no stamps at all', () => {
    expect(lastStampDay(modelOf({ Ana: '' }), TODAY)).toBeNull()
  })
})

describe('the rep', () => {
  it('reads the same stats for the same rep in a bigger model', () => {
    const solo = statsOf('3 in person, 2 fairs')
    const model = modelOf({ Ana: '3 in person, 2 fairs', Ben: '4 in person, 2 hub, fall' })
    expect(repStats(model, repOf(model, 'Ana'), TODAY)).toEqual(solo)
  })
})
