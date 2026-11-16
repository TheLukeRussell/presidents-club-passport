// Tests for the smaller helpers: seeded randomness, the model, stamp looks
// and the formatters.

import { describe, expect, it } from 'vitest'
import { SUPPLIERS } from '../config'
import { daysBetween, firstName, givenNames, initials, longDate, monthName, ordinal, plural, shortDate, stampDate, surname } from './format'
import { buildModel, findRep, repIdFromEmail, stampFrom, stampsOf, withStamps } from './model'
import { hashString, seededRandom, shuffled, unitFor } from './random'
import { repStats } from './rules'
import { STAMP_SHAPES, stampLook } from './stamps'
import { emailOf, modelOf, repOf, repRow, sheet, stampRow, stampsFor, TODAY } from './test-helpers'

describe('the test stories', () => {
  it('read the way the brief talks', () => {
    const rows = stampsFor('Ana', '3 in-person trainings, 1 virtual, 2 fairs, 1 Hub course, Club Express Fall')
    const count = (a: string, format?: string) => rows.filter((r) => r.activity === a && (!format || r.format === format)).length
    expect([count('training', 'in person'), count('training', 'virtual'), count('fair'), count('hub'), count('club')]).toEqual([3, 1, 2, 1, 1])
    expect(stampsFor('Ana', '1 in person, spring, quota').map((r) => [r.activity, r.date])).toEqual([
      ['training', '2026-07-28'],
      ['club', '2027-06-17'],
      ['quota', '2027-06-17'],
    ])
  })
  it('throw on anything they don’t know, so a typo can’t pass a test', () => {
    expect(() => stampsFor('Ana', '2 fiars')).toThrow()
    expect(() => stampsFor('Ana', '9 fairs')).toThrow()
  })
})

describe('random', () => {
  it('gives the same sequence for the same seed', () => {
    const a = seededRandom(42)
    const b = seededRandom(42)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
  })
  it('stays in [0, 1)', () => {
    const r = seededRandom(7)
    for (let i = 0; i < 1000; i++) {
      const x = r()
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThan(1)
    }
  })
  it('hashes strings stably', () => {
    expect(hashString('zebra')).toBe(hashString('zebra'))
    expect(hashString('zebra')).not.toBe(hashString('zebrA'))
    expect(unitFor('x', 1)).toBe(unitFor('x', 1))
  })
  it('shuffles without losing anything', () => {
    expect(shuffled([1, 2, 3, 4, 5], seededRandom(3)).sort()).toEqual([1, 2, 3, 4, 5])
  })
})

describe('model', () => {
  it('makes url-safe rep ids from emails', () => {
    expect(repIdFromEmail('Hannah.Kowalski@example.com')).toBe('hannah-kowalski')
    expect(repIdFromEmail('amélie.o.gagnon@example.com')).toBe('amelie-o-gagnon')
    expect(repIdFromEmail('_jo..smith_@example.com')).toBe('jo-smith')
  })

  it('names a stamp by its activity, day and event, so a room full of reps shares one', () => {
    const ana = stampFrom(stampRow('Ana', 'training', '2027-06-17', { event: 'Pioneer solutions workshop' }))
    const ben = stampFrom(stampRow('Ben', 'training', '2027-06-17', { event: 'Pioneer solutions workshop' }))
    expect(ana.id).toBe('training-2027-06-17-pioneer-solutions-workshop')
    expect(ben.id).toBe(ana.id)
    expect(stampFrom(stampRow('Ana', 'club', '2026-10-14')).id).toBe('club-2026-10-14-club-express-fall')
  })

  it('sorts reps by name and stamps by date', () => {
    const model = modelOf({ Zed: '2 fairs', Ana: '1 hub, fall' })
    expect(model.reps.map((r) => r.name)).toEqual(['Ana', 'Zed'])
    expect(model.stamps.map((s) => s.date)).toEqual(['2026-07-15', '2026-09-10', '2026-10-14', '2026-12-03'])
    expect(stampsOf(model, repOf(model, 'Zed')).map((s) => s.activity)).toEqual(['fair', 'fair'])
  })

  it('keeps the start date and gives a rep with no stamps an empty list', () => {
    const model = modelOf({ Ana: { team: 'Federal', start: '2027-06-01' } })
    expect(repOf(model, 'Ana')).toEqual({ id: 'ana', email: 'ana@example.com', name: 'Ana', team: 'Federal', start: '2027-06-01' })
    expect(stampsOf(model, repOf(model, 'Ana'))).toEqual([])
    expect(findRep(model, 'nobody')).toBeUndefined()
  })

  it('drops stamps for anyone who isn’t on the Reps tab', () => {
    const model = buildModel({ reps: [repRow('Ana')], stamps: [stampRow('Ana', 'fair', '2027-03-04'), stampRow('Ghost', 'fair', '2027-03-04')] })
    expect(model.stamps.map((s) => s.email)).toEqual([emailOf('Ana')])
  })

  it('adds stamps on Record without stamping anyone twice', () => {
    const model = modelOf({ Ana: '1 fair', Ben: '' })
    const summer = (name: string) => stampRow(name, 'fair', '2027-06-17', { event: 'Summer Supplier Fair' })
    const next = withStamps(model, [summer('Ana'), summer('Ben')])
    expect(repStats(next, repOf(next, 'Ana'), TODAY).progress.fair.counted).toBe(2)
    expect(repStats(next, repOf(next, 'Ben'), TODAY).progress.fair.counted).toBe(1)
    // The same stamp again changes nothing, and hands back the same model.
    expect(withStamps(next, [summer('Ana')])).toBe(next)
    // The original model is untouched.
    expect(repStats(model, repOf(model, 'Ana'), TODAY).progress.fair.counted).toBe(1)
  })

  it('keeps stamps in date order after Record', () => {
    const model = buildModel(sheet({ Ana: '2 fairs' }))
    const next = withStamps(model, [stampRow('Ana', 'hub', '2026-10-01')])
    expect(next.stamps.map((s) => s.date)).toEqual(['2026-09-10', '2026-10-01', '2026-12-03'])
  })
})

describe('stampLook', () => {
  it('gives every listed supplier its own shape and ink pair', () => {
    const pairs = SUPPLIERS.map((s) => {
      const look = stampLook('training', s, 'a@example.com', 't1')
      return `${look.shape}/${look.ink}`
    })
    expect(new Set(pairs).size).toBe(SUPPLIERS.length)
  })
  it('gives fairs, Hub courses and Club Express one look each, whatever the supplier', () => {
    expect(stampLook('fair', '', 'a@example.com', 'f1')).toMatchObject({ shape: 'banner', ink: 2 })
    expect(stampLook('hub', 'Zebra', 'a@example.com', 'h1')).toMatchObject({ shape: 'shield', ink: 1 })
    expect(stampLook('hub', 'Cisco', 'a@example.com', 'h2')).toMatchObject({ shape: 'shield', ink: 1 })
    expect(stampLook('club', '', 'a@example.com', 'c1')).toMatchObject({ shape: 'diamond', ink: 3 })
  })
  it('keeps the same tilt for the same rep and stamp', () => {
    expect(stampLook('training', 'Zebra', 'a@example.com', 't1').rotate).toBe(stampLook('training', 'Zebra', 'a@example.com', 't1').rotate)
  })
  it('tilts a little, never a lot', () => {
    for (let i = 0; i < 50; i++) {
      const { rotate } = stampLook('training', 'Brady', `r${i}@example.com`, `t${i}`)
      expect(Math.abs(rotate)).toBeLessThanOrEqual(9)
    }
  })
  it('handles a supplier that is not on the list', () => {
    const look = stampLook('training', 'Somebody New', 'a@example.com', 't1')
    expect(STAMP_SHAPES).toContain(look.shape)
    expect(look).toEqual(stampLook('training', 'Somebody New', 'a@example.com', 't1'))
  })
})

describe('format', () => {
  it('formats dates without time zone drift', () => {
    expect(shortDate('2027-06-17')).toBe('Thu, Jun 17')
    expect(longDate('2027-06-30')).toBe('June 30, 2027')
    expect(stampDate('2027-01-05')).toBe('05 JAN 2027')
    expect(daysBetween('2027-06-17', '2027-07-14')).toBe(27)
    expect(monthName(10)).toBe('October')
  })
  it('does ordinals', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 101].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '101st'])
  })
  it('splits and shortens names', () => {
    expect(initials('Hannah Kowalski')).toBe('HK')
    expect(initials('Cher')).toBe('C')
    expect(firstName('Mary Ann Lee')).toBe('Mary')
    expect(givenNames('Mary Ann Lee')).toBe('Mary Ann')
    expect(surname('Mary Ann Lee')).toBe('Lee')
  })
  it('pluralizes', () => {
    expect(plural(1, 'stamp')).toBe('1 stamp')
    expect(plural(3, 'stamp')).toBe('3 stamps')
    expect(plural(2, 'Hub course')).toBe('2 Hub courses')
  })
})
