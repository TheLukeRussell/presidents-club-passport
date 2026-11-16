// Tests for the wording: the data page's message, the endorsements, and the
// short labels on the checklist and the board.

import { describe, expect, it } from 'vitest'
import { DEMO_TODAY, HUB_COURSES, type Activity } from '../config'
import type { StampRow } from '../data/types'
import { countOf, endorsement, joinAnd, lineMessage, needPhrase, progressLabel, quotaWhen, statusWord } from './messages'
import { repStats, statusOf, type Context } from './rules'
import { modelOf, repOf, stampRow, statsOf, TODAY, type Who } from './test-helpers'

const NB = '\u00a0'
const HANNAH = '3 in person, 1 fair, 1 hub, Club Express Fall'
const DONE = '4 in person, 2 fairs, 2 hub, fall, spring'
const ALL = `${DONE}, quota`

// Four trainings, two fairs and two Hub courses, all before Club Express Fall.
const early = (name: string): StampRow[] => [
  ...['2026-07-07', '2026-07-14', '2026-07-21', '2026-07-28'].map((date) => stampRow(name, 'training', date)),
  stampRow(name, 'fair', '2026-08-04'),
  stampRow(name, 'fair', '2026-08-11', { event: 'Another fair' }),
  stampRow(name, 'hub', '2026-08-18'),
  stampRow(name, 'hub', '2026-08-25', { event: HUB_COURSES[1].event }),
]

// Records one more stamp on top of a story, the way the demo does, and hands
// back that stamp with the stats after it.
function recordOn(story: string, row: (name: string) => StampRow) {
  const added = row('Ana')
  const model = modelOf({ Ana: story }, [added])
  const rep = repOf(model, 'Ana')
  const stamp = model.stamps.find((s) => s.activity === added.activity && s.date === added.date && s.event === added.event)!
  return { stamp, stats: repStats(model, rep, TODAY) }
}

describe('joinAnd', () => {
  it('joins with commas and a last “and”', () => {
    expect(joinAnd([])).toBe('')
    expect(joinAnd(['a'])).toBe('a')
    expect(joinAnd(['a', 'b'])).toBe('a and b')
    expect(joinAnd(['a', 'b', 'c'])).toBe('a, b and c')
  })
})

describe('quotaWhen', () => {
  it('says when the results land, without the year', () => {
    expect(quotaWhen()).toBe('Quota results land June 30')
  })
})

describe('needPhrase', () => {
  const need = (story: string, activity: Activity, ctx: Context = TODAY) => needPhrase(statsOf(story, ctx).progress[activity], ctx)

  it('counts what each minimum still takes', () => {
    expect(need('3 in person', 'training')).toBe('1 more in-person training')
    expect(need('1 in person, 5 virtual', 'training')).toBe('3 more in-person trainings')
    expect(need('1 fair', 'fair')).toBe('1 more fair')
    expect(need('', 'fair')).toBe('2 more fairs')
    expect(need('1 hub', 'hub')).toBe('1 more Hub course')
    expect(need('', 'hub')).toBe('2 more Hub courses')
    expect(need('', 'quota')).toBe('the quota')
  })

  it('names the Club Express event still to come', () => {
    expect(need('', 'club', { today: '2026-07-01' })).toBe('both Club Express events')
    expect(need('fall', 'club')).toBe('Club Express Spring')
    // Nothing left on the calendar.
    expect(need('fall', 'club', { today: '2027-06-18' })).toBe('1 more Club Express event')
  })
})

describe('progressLabel and countOf', () => {
  const label = (story: string, activity: Activity) => progressLabel(statsOf(story).progress[activity])

  it('caps the count at the minimum, so extras don’t show', () => {
    expect(label('6 in person, 2 virtual', 'training')).toBe('4 of 4 in person')
    expect(label('4 fairs', 'fair')).toBe('2 of 2')
    expect(countOf(statsOf('6 in person').progress.training)).toBe('4 of 4')
  })

  it('counts in-person trainings only', () => {
    expect(label('2 in person, 6 virtual', 'training')).toBe('2 of 4 in person')
    expect(label('', 'training')).toBe('0 of 4 in person')
  })

  it('reads the rest as plain counts and the quota as a yes or no', () => {
    expect(label('1 fair', 'fair')).toBe('1 of 2')
    expect(label('', 'hub')).toBe('0 of 2')
    expect(label('fall', 'club')).toBe('1 of 2')
    expect(label('', 'quota')).toBe('Not yet')
    expect(label('quota', 'quota')).toBe('Achieved')
  })
})

describe('statusWord', () => {
  const word = (story: string, ctx: Context = TODAY) => {
    const stats = statsOf(story, ctx)
    return statusWord(statusOf(stats), stats)
  }
  it('has a word or two for each status', () => {
    expect(word(ALL)).toBe('Qualified')
    expect(word(DONE)).toBe('On track')
    expect(word('4 in person, 2 fairs, 2 hub')).toBe('Out of reach')
    expect(word(HANNAH)).toBe('5 to go')
    expect(word('4 in person, 2 fairs, fall')).toBe('3 to go')
  })
})

describe('lineMessage', () => {
  const message = (story: string | Who, ctx: Context = TODAY, extra?: (name: string) => StampRow[]) => lineMessage(statsOf(story, ctx, extra), ctx)

  it('lists everything still to do, then when the quota lands', () => {
    expect(message(HANNAH)).toEqual({
      head: 'Five to go',
      sub: '1 more in-person training, 1 more fair, 1 more Hub course and Club Express Spring. Quota results land June 30.',
    })
    expect(message('', { today: '2026-07-01' })).toEqual({
      head: 'Five to go',
      sub: '4 more in-person trainings, 2 more fairs, 2 more Hub courses and both Club Express events. Quota results land June 30.',
    })
  })

  it('spells out how many are left and starts with a capital', () => {
    expect(message('4 in person, 2 fairs, 2 hub, fall')).toEqual({ head: 'Two to go', sub: 'Club Express Spring. Quota results land June 30.' })
    expect(message('', { today: '2026-09-01' }, early)).toEqual({
      head: 'Two to go',
      sub: 'Both Club Express events. Quota results land June 30.',
    })
  })

  it('leaves the quota line off once the seal is in', () => {
    expect(message('4 in person, 2 fairs, fall, quota')).toEqual({ head: 'Two to go', sub: '2 more Hub courses and Club Express Spring.' })
  })

  it('says all four are done when only the quota is left', () => {
    expect(message(DONE)).toEqual({ head: 'All four activities done', sub: 'Quota results land June 30.' })
  })

  it('says qualified once all five are met', () => {
    expect(message(ALL)).toEqual({ head: 'Qualified for President’s Club', sub: 'All five minimums met. See you on the trip in 2028.' })
  })

  it('says which Club Express events were missed', () => {
    expect(message('4 in person, 2 fairs, 2 hub')).toEqual({
      head: 'Out of reach this year',
      sub: 'Club Express takes both events, and Club Express Fall has passed.',
    })
    expect(message('', { today: '2027-06-18' })).toEqual({
      head: 'Out of reach this year',
      sub: 'Club Express takes both events, and Club Express Fall and Club Express Spring have passed.',
    })
    expect(message({ start: '2027-06-01' }).sub).toBe('Club Express takes both events, and Club Express Fall has passed.')
  })

  it('says the year closed when the quota never came', () => {
    expect(message(DONE, { today: '2027-07-01' })).toEqual({
      head: 'Out of reach this year',
      sub: 'The year closed before every minimum was met.',
    })
  })
})

describe('endorsement', () => {
  const pioneer = (name: string) => stampRow(name, 'training', DEMO_TODAY, { event: 'Pioneer solutions workshop', supplier: 'Pioneer' })

  it('gives the date, this page’s count and where that leaves the rep', () => {
    const { stamp, stats } = recordOn(HANNAH, pioneer)
    expect(endorsement(stamp, stats)).toBe(`Stamped 17${NB}JUN${NB}2027. In person 4${NB}of${NB}4, done. 1 of 5 met.`)
  })

  it('leaves off “done” while the page is still short', () => {
    const { stamp, stats } = recordOn('2 in person', pioneer)
    expect(endorsement(stamp, stats)).toBe(`Stamped 17${NB}JUN${NB}2027. In person 3${NB}of${NB}4. 0 of 5 met.`)
    const hub = recordOn('', (name) => stampRow(name, 'hub', DEMO_TODAY))
    expect(endorsement(hub.stamp, hub.stats)).toBe(`Stamped 17${NB}JUN${NB}2027. Hub 1${NB}of${NB}2. 0 of 5 met.`)
  })

  it('names each page’s count its own way', () => {
    const fair = recordOn('1 fair', (name) => stampRow(name, 'fair', DEMO_TODAY, { event: 'Summer Supplier Fair' }))
    expect(endorsement(fair.stamp, fair.stats)).toBe(`Stamped 17${NB}JUN${NB}2027. Fairs 2${NB}of${NB}2, done. 1 of 5 met.`)
    const club = recordOn('4 in person, 2 fairs, 2 hub, fall', (name) => stampRow(name, 'club', DEMO_TODAY))
    expect(endorsement(club.stamp, club.stats)).toBe(`Stamped 17${NB}JUN${NB}2027. Club Express 2${NB}of${NB}2, done. All four activities done.`)
  })

  it('seals the quota, and says qualified when it’s the last one', () => {
    const last = recordOn(DONE, (name) => stampRow(name, 'quota', DEMO_TODAY))
    expect(endorsement(last.stamp, last.stats)).toBe(`Sealed 17${NB}JUN${NB}2027. Qualified for President’s Club.`)
    const first = recordOn('2 fairs', (name) => stampRow(name, 'quota', DEMO_TODAY))
    expect(endorsement(first.stamp, first.stats)).toBe(`Sealed 17${NB}JUN${NB}2027. 2 of 5 met.`)
  })
})

describe('the wording', () => {
  it('uses curly apostrophes and no dashes or straight quotes anywhere', () => {
    const stories = ['', HANNAH, DONE, ALL, '4 in person, 2 fairs, 2 hub', '6 in person, 4 fairs, quota']
    const days: Context[] = [{ today: '2026-07-01' }, TODAY, { today: '2027-06-18' }, { today: '2027-07-01' }]
    const words: string[] = [quotaWhen()]
    for (const story of stories) {
      for (const ctx of days) {
        const stats = statsOf(story, ctx)
        const { head, sub } = lineMessage(stats, ctx)
        words.push(head, sub, statusWord(statusOf(stats), stats))
        for (const p of Object.values(stats.progress)) words.push(progressLabel(p), needPhrase(p, ctx))
      }
    }
    for (const text of words) expect(text).not.toMatch(/[\u2013\u2014'"]/)
    expect(words.some((text) => text.includes('’'))).toBe(true)
  })
})
