// The mapping between the app's activities and Supabase's stamp types. The
// seed, the importer and the live passport all lean on it, so a slip here
// would put stamps under the wrong type everywhere at once.

import { describe, expect, it } from 'vitest'
import { ACTIVITIES, CLUB_EXPRESS, FISCAL_YEAR } from '../config'
import { ACTIVITY_TYPES, activityFor, activityKey, activityOf, activityTypeOf, isActivityType, isUndated, QUOTA_TITLE } from './activity-types'
import type { StampRow } from './types'

const row = (over: Partial<StampRow>): StampRow => ({
  rep_email: 'ana.lee@example.com',
  activity: 'training',
  event: 'Supplier A solutions workshop',
  supplier: 'Supplier A',
  date: '2026-08-04',
  format: 'in person',
  location: 'Greenville',
  ...over,
})

describe('activity types', () => {
  it('splits trainings by format and maps everything else one to one', () => {
    expect(activityTypeOf('training', 'in person')).toBe('in_person_training')
    expect(activityTypeOf('training', 'virtual')).toBe('virtual_training')
    expect(activityTypeOf('fair', 'in person')).toBe('supplier_fair')
    expect(activityTypeOf('hub', '')).toBe('hub_training')
    expect(activityTypeOf('club', 'in person')).toBe('club_express')
    expect(activityTypeOf('quota', '')).toBe('quota')
  })

  it('treats a training with no format as virtual, like the sheet does', () => {
    expect(activityTypeOf('training', '')).toBe('virtual_training')
  })

  it('round-trips every type', () => {
    for (const type of ACTIVITY_TYPES) {
      const { activity, format } = activityOf(type)
      expect(activityTypeOf(activity, format)).toBe(type)
    }
  })

  it('covers every app activity', () => {
    const covered = new Set(ACTIVITY_TYPES.map((t) => activityOf(t).activity))
    expect([...covered].sort()).toEqual([...ACTIVITIES].sort())
  })

  it('knows its own names', () => {
    expect(isActivityType('hub_training')).toBe(true)
    expect(isActivityType('hub')).toBe(false)
    expect(isActivityType(undefined)).toBe(false)
    expect(isUndated('hub_training')).toBe(true)
    expect(isUndated('quota')).toBe(true)
    expect(isUndated('supplier_fair')).toBe(false)
  })
})

describe('activityFor', () => {
  it('keeps a dated training with its supplier and city', () => {
    expect(activityFor(row({}))).toEqual({
      type: 'in_person_training',
      title: 'Supplier A solutions workshop',
      supplier: 'Supplier A',
      location: 'Greenville',
      event_date: '2026-08-04',
    })
  })

  it('drops the city from virtual trainings and stores blanks as null', () => {
    const a = activityFor(row({ format: 'virtual', location: 'Atlanta', supplier: ' ' }))
    expect(a).toMatchObject({ type: 'virtual_training', supplier: null, location: null })
  })

  it('makes a Hub course one undated activity whatever day it was finished', () => {
    const one = activityFor(row({ activity: 'hub', event: 'Video room design', format: '', date: '2026-09-01' }))
    const two = activityFor(row({ activity: 'hub', event: 'Video room design', format: '', date: '2027-02-11' }))
    expect(one).toMatchObject({ type: 'hub_training', event_date: null, location: null })
    expect(typeof one !== 'string' && typeof two !== 'string' && activityKey(one) === activityKey(two)).toBe(true)
  })

  it('files Club Express under the set session, found by name or day', () => {
    const [fall, spring] = CLUB_EXPRESS
    expect(activityFor(row({ activity: 'club', event: 'club express, fall', date: fall.date }))).toMatchObject({
      type: 'club_express',
      title: fall.title,
      event_date: fall.date,
    })
    expect(activityFor(row({ activity: 'club', event: 'Spring kickoff', date: spring.date }))).toMatchObject({ title: spring.title, event_date: spring.date })
  })

  it('refuses a Club Express named for a session but dated another day', () => {
    // It would count before the session happened.
    expect(activityFor(row({ activity: 'club', event: 'Club Express Spring', date: '2026-11-01' }))).toMatch(/dated 2026-11-01, but Club Express Spring was on 2027-06-17/)
    expect(activityFor(row({ activity: 'club', event: 'Club Express Fall', date: '2027-06-17' }))).toMatch(/but Club Express Fall was on 2026-10-14/)
  })

  it('refuses a Club Express that is neither session', () => {
    expect(activityFor(row({ activity: 'club', event: 'Regional kickoff', date: '2027-01-12' }))).toMatch(/isn’t either Club Express session/)
  })

  it('puts every quota under the year’s one quota activity', () => {
    expect(QUOTA_TITLE).toBe(`${FISCAL_YEAR} sales growth quota`)
    expect(activityFor(row({ activity: 'quota', event: 'Sales growth quota', format: '', date: '2027-06-30' }))).toEqual({
      type: 'quota',
      title: QUOTA_TITLE,
      supplier: null,
      location: null,
      event_date: null,
    })
  })
})
