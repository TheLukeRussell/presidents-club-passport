// Tests for the demo's Record buttons: what each one stamps, who else gets
// the same stamp, and which rep the demo opens as.

import { describe, expect, it } from 'vitest'
import { DEMO_TODAY, FISCAL_YEAR, HUB_COURSES } from '../config'
import { demoStamp, demoStamps, GROUP_EVENTS, pickAttendees, pickDefaultRep } from './demo'
import { buildModel, withStamps } from './model'
import { emailOf, modelOf, repOf, stampRow, TODAY } from './test-helpers'

const ALL_HUB = `${HUB_COURSES.length} hub`

describe('demoStamp', () => {
  const model = modelOf({ Ana: '3 in person, 1 fair, 1 hub, fall' })
  const ana = repOf(model, 'Ana')

  it('stamps today’s training, fair and Club Express', () => {
    const base = { rep_email: 'ana@example.com', date: DEMO_TODAY }
    expect(demoStamp(model, ana, 'training', TODAY)).toEqual({
      ...base,
      activity: 'training',
      event: 'Pioneer solutions workshop',
      supplier: 'Pioneer',
      format: 'in person',
      location: 'Greenville',
    })
    expect(demoStamp(model, ana, 'fair', TODAY)).toEqual({
      ...base,
      activity: 'fair',
      event: 'Summer Supplier Fair',
      supplier: '',
      format: 'in person',
      location: 'Greenville',
    })
    expect(demoStamp(model, ana, 'club', TODAY)).toEqual({
      ...base,
      activity: 'club',
      event: 'Club Express Spring',
      supplier: '',
      format: 'in person',
      location: 'Greenville',
    })
  })

  it('presses the gold seal once and only once', () => {
    expect(demoStamp(model, ana, 'quota', TODAY)).toEqual({
      rep_email: 'ana@example.com',
      activity: 'quota',
      event: `${FISCAL_YEAR} sales growth quota`,
      supplier: '',
      date: DEMO_TODAY,
      format: '',
      location: '',
    })
    const sealed = withStamps(model, [demoStamp(model, ana, 'quota', TODAY)!])
    expect(demoStamp(sealed, ana, 'quota', TODAY)).toBeNull()
    // A seal from the sheet counts too, whatever its date.
    const fromSheet = modelOf({ Ana: '' }, [stampRow('Ana', 'quota', '2027-06-30')])
    expect(demoStamp(fromSheet, repOf(fromSheet, 'Ana'), 'quota', TODAY)).toBeNull()
  })

  it('never gives the same group stamp twice', () => {
    for (const activity of GROUP_EVENTS) {
      const next = withStamps(model, [demoStamp(model, ana, activity, TODAY)!])
      expect(demoStamp(next, ana, activity, TODAY), activity).toBeNull()
    }
  })

  it('picks the first Hub course the rep hasn’t done', () => {
    expect(demoStamp(model, ana, 'hub', TODAY)).toMatchObject({ event: HUB_COURSES[1].event, supplier: HUB_COURSES[1].supplier, format: '', location: '' })
    const none = modelOf({ Ana: '' })
    expect(demoStamp(none, repOf(none, 'Ana'), 'hub', TODAY)).toMatchObject({ event: HUB_COURSES[0].event })
    // A course that isn't in the catalog doesn't use up a pick.
    const other = modelOf({ Ana: '' }, [stampRow('Ana', 'hub', '2027-01-06', { event: 'Something else' })])
    expect(demoStamp(other, repOf(other, 'Ana'), 'hub', TODAY)).toMatchObject({ event: HUB_COURSES[0].event })
  })

  it('moves on to the next Hub course each time, and stops when they’re all done', () => {
    const first = withStamps(model, [demoStamp(model, ana, 'hub', TODAY)!])
    expect(demoStamp(first, ana, 'hub', TODAY)).toMatchObject({ event: HUB_COURSES[2].event })
    const done = modelOf({ Ana: ALL_HUB })
    expect(demoStamp(done, repOf(done, 'Ana'), 'hub', TODAY)).toBeNull()
  })
})

describe('pickAttendees', () => {
  const cast = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`Rep ${String(i).padStart(2, '0')}`, '1 fair']))
  const model = modelOf({ ...cast, Ana: '1 fair', Newbie: { start: '2027-07-01' } })
  const ana = repOf(model, 'Ana')

  it('stamps only the rep for a Hub course or the quota', () => {
    expect(pickAttendees(model, 'hub', ana, 1, 1, TODAY)).toEqual([ana.email])
    expect(pickAttendees(model, 'quota', ana, 1, 1, TODAY)).toEqual([ana.email])
  })

  it('always includes the rep, even when nobody else comes', () => {
    for (const activity of GROUP_EVENTS) expect(pickAttendees(model, activity, ana, 0, 1, TODAY)).toEqual([ana.email])
  })

  it('brings everyone who’s started when the share is all of them, in email order', () => {
    const emails = pickAttendees(model, 'fair', ana, 1, 1, TODAY)
    expect(emails).toHaveLength(41)
    expect(emails).not.toContain(emailOf('Newbie'))
    expect(emails).toEqual([...emails].sort())
  })

  it('skips anyone who already has the stamp', () => {
    const repeat = withStamps(model, [stampRow('Rep 00', 'fair', DEMO_TODAY, { event: 'Summer Supplier Fair', location: 'Greenville' })])
    expect(pickAttendees(repeat, 'fair', ana, 1, 1, TODAY)).not.toContain(emailOf('Rep 00'))
  })

  it('is the same every time for the same seed', () => {
    const once = pickAttendees(model, 'club', ana, 0.5, 9, TODAY)
    expect(pickAttendees(model, 'club', ana, 0.5, 9, TODAY)).toEqual(once)
    expect(once.length).toBeGreaterThan(5)
    expect(once.length).toBeLessThan(36)
    expect(pickAttendees(model, 'club', ana, 0.5, 10, TODAY)).not.toEqual(once)
  })

  it('flips a separate coin for each event', () => {
    const training = pickAttendees(model, 'training', ana, 0.5, 9, TODAY)
    const fair = pickAttendees(model, 'fair', ana, 0.5, 9, TODAY)
    expect(training).not.toEqual(fair)
  })
})

describe('demoStamps', () => {
  it('stamps each email it knows, once', () => {
    const model = modelOf({ Ana: '', Ben: '' }, [stampRow('Ben', 'fair', DEMO_TODAY, { event: 'Summer Supplier Fair' })])
    const rows = demoStamps(model, 'fair', [emailOf('Ana'), emailOf('Ben'), 'gone@example.com'], TODAY)
    expect(rows.map((r) => r.rep_email)).toEqual([emailOf('Ana')])
    expect(rows[0]).toMatchObject({ activity: 'fair', event: 'Summer Supplier Fair', date: DEMO_TODAY })
  })
})

describe('pickDefaultRep', () => {
  const model = modelOf({
    Ana: '4 in person, 2 fairs, 2 hub, fall, spring',
    Ben: '2 fairs, fall',
    Cy: '1 fair, 1 virtual, fall',
    Di: '1 hub, fall',
    Ed: '1 virtual', // missed Club Express Fall
  })

  it('opens as the pinned rep when they’re in the data', () => {
    expect(pickDefaultRep(model, TODAY, 'di')?.name).toBe('Di')
    expect(pickDefaultRep(model, TODAY, 'ed')?.name).toBe('Ed')
  })

  it('otherwise opens as whoever has the most to do and can still qualify', () => {
    // Cy and Di have nothing met, and Cy has more stamps. Ed is out of reach.
    expect(pickDefaultRep(model, TODAY, 'hannah-kowalski')?.name).toBe('Cy')
    expect(pickDefaultRep(model, TODAY)?.name).toBe('Cy')
  })

  it('breaks a tie by name', () => {
    const twins = modelOf({ Zoe: '1 fair, fall', Bo: '1 fair, fall' })
    expect(pickDefaultRep(twins, TODAY)?.name).toBe('Bo')
  })

  it('falls back to the first rep when nobody can qualify, and to nobody with no reps', () => {
    expect(pickDefaultRep(modelOf({ Zed: '', Abe: '1 fair' }), TODAY)?.name).toBe('Abe')
    expect(pickDefaultRep(buildModel({ reps: [], stamps: [] }), TODAY)).toBeUndefined()
  })
})
