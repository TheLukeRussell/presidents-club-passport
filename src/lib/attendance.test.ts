// The attendance importer's reading and planning. The script around it does
// the database calls; everything it decides comes from here.

import { describe, expect, it } from 'vitest'
import { CLUB_EXPRESS } from '../config'
import { QUOTA_TITLE } from '../data/activity-types'
import { planImport, planIsEmpty, readAttendance, type CurrentState } from './attendance'

const TODAY = '2026-11-24'
const HEADER = ['Email', 'Name', 'Team', 'Company', 'Type', 'Activity title', 'Supplier', 'Format', 'Location', 'Date']
const csv = (...rows: string[][]) => [HEADER, ...rows]
const EMPTY: CurrentState = { reps: [], activities: [], stamps: [] }

describe('readAttendance', () => {
  it('reads the brief’s columns, with “Activity title” as the event', () => {
    const { rows, skipped } = readAttendance(
      csv(['Ana.Lee@Example.com', 'Ana Lee', 'posb', '', 'in_person_training', 'Supplier A solutions workshop', 'Supplier A', '', 'Greenville', '8/4/2026']),
      TODAY,
    )
    expect(skipped).toEqual([])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      email: 'ana.lee@example.com',
      name: 'Ana Lee',
      team: 'POSB',
      earned_at: '2026-08-04',
      activity: { type: 'in_person_training', title: 'Supplier A solutions workshop', supplier: 'Supplier A', location: 'Greenville', event_date: '2026-08-04' },
    })
  })

  it('works out the type from the title when there’s no type column', () => {
    const grid = [
      ['email', 'name', 'company', 'activity title', 'date'],
      ['ana@example.com', 'Ana', 'Acme', 'Fall Supplier Fair', '2026-09-24'],
      ['ana@example.com', 'Ana', 'Acme', 'Club Express Fall', '2026-10-14'],
      ['ana@example.com', 'Ana', 'Acme', 'Video room design', '2026-10-01'],
    ]
    const { rows, skipped, notes, inferred } = readAttendance(grid, TODAY)
    expect(rows.map((r) => r.activity.type)).toEqual(['supplier_fair', 'club_express'])
    expect(rows[0].company).toBe('Acme')
    expect(skipped).toEqual([expect.stringMatching(/^Row 4: can’t tell what kind of activity “Video room design” is from its title, so add a type column/)])
    // Every guess is noted, and counted.
    expect(inferred).toBe(2)
    expect(notes).toEqual([
      expect.stringMatching(/^Row 2: no type, so “Fall Supplier Fair” is read as a supplier fair from its title/),
      expect.stringMatching(/^Row 3: no type, so “Club Express Fall” is read as Club Express from its title/),
    ])
  })

  it('only guesses from whole words, and never guesses the quota', () => {
    const grid = [
      ['email', 'name', 'activity title', 'date'],
      ['a@example.com', 'A', 'Partner Growth Summit', '2026-09-01'],
      ['a@example.com', 'A', 'GitHub Copilot training', '2026-09-02'],
      ['a@example.com', 'A', 'Fairfield partner training', '2026-09-03'],
      ['a@example.com', 'A', 'FY27 sales growth quota', '2026-09-04'],
      ['a@example.com', 'A', 'Hub: Cloud networking fundamentals', '2026-09-05'],
    ]
    const { rows, skipped } = readAttendance(grid, TODAY)
    expect(rows.map((r) => [r.line, r.activity.type])).toEqual([
      [3, 'virtual_training'],
      [4, 'virtual_training'],
      [6, 'hub_training'],
    ])
    expect(skipped.map((s) => s.slice(0, 6))).toEqual(['Row 2:', 'Row 5:'])
  })

  it('lets an explicit type win, and leaves out a row whose type and format disagree', () => {
    const { rows, skipped } = readAttendance(
      csv(
        ['a@example.com', 'A', '', '', 'virtual_training', 'Supplier A partner training', 'Supplier A', 'In person', '', '2026-08-12'],
        ['a@example.com', 'A', '', '', 'in_person_training', 'Supplier B solutions workshop', 'Supplier B', '', 'Dallas', '2026-08-13'],
        ['a@example.com', 'A', '', '', 'in_person_training', 'Supplier C solutions workshop', 'Supplier C', 'In person', 'Dallas', '2026-08-14'],
      ),
      TODAY,
    )
    expect(skipped).toEqual([expect.stringMatching(/^Row 2: the type says virtual but the format says in person, so it’s left out/)])
    expect(rows.map((r) => r.activity.type)).toEqual(['in_person_training', 'in_person_training'])
  })

  it('leaves out an email the database would refuse', () => {
    const { rows, skipped } = readAttendance(
      csv(
        ['a@', 'A', '', '', 'supplier_fair', 'Fall Supplier Fair', '', '', '', '2026-09-24'],
        ['jo smith@example.com', 'Jo', '', '', 'supplier_fair', 'Fall Supplier Fair', '', '', '', '2026-09-24'],
        ['@example.com', 'X', '', '', 'supplier_fair', 'Fall Supplier Fair', '', '', '', '2026-09-24'],
      ),
      TODAY,
    )
    expect(rows).toEqual([])
    expect(skipped).toHaveLength(3)
    expect(skipped[0]).toMatch(/isn’t an email address it can use/)
  })

  it('takes a team or company from a later row when the first leaves it blank', () => {
    const { rows } = readAttendance(
      csv(
        ['a@example.com', 'Ana', '', '', 'supplier_fair', 'Fall Supplier Fair', '', '', '', '2026-09-24'],
        ['a@example.com', 'Ana', 'POSB', 'Acme', 'supplier_fair', 'Winter Supplier Fair', '', '', '', '2026-11-05'],
      ),
      TODAY,
    )
    expect(rows.map((r) => [r.team, r.company])).toEqual([
      ['POSB', 'Acme'],
      ['POSB', 'Acme'],
    ])
  })

  it('says when two suppliers’ same-named sessions on one day would be stored as one', () => {
    const { rows, notes, skipped } = readAttendance(
      csv(
        ['a@example.com', 'A', '', '', 'hub_training', 'Product fundamentals', 'Supplier A', '', '', '2026-09-01'],
        ['b@example.com', 'B', '', '', 'hub_training', 'Product fundamentals', 'Supplier B', '', '', '2026-09-02'],
        ['a@example.com', 'A', '', '', 'hub_training', 'Product fundamentals', 'Supplier B', '', '', '2026-09-03'],
      ),
      TODAY,
    )
    expect(rows).toHaveLength(2)
    expect(notes.some((n) => /^Row 3: same event and day as row 2 but Supplier B, not Supplier A/.test(n))).toBe(true)
    expect(skipped).toEqual([expect.stringMatching(/^Row 4: same event and day as row 2 but Supplier B, not Supplier A, and a@example.com already has it from row 2/)])
  })

  it('splits trainings by format, and calls a training with no format virtual', () => {
    const { rows, notes } = readAttendance(
      csv(
        ['a@example.com', 'A', '', '', 'training', 'Supplier A solutions workshop', 'Supplier A', 'In person', 'Atlanta', '2026-08-04'],
        ['a@example.com', 'A', '', '', 'virtual_training', 'Supplier B partner training', 'Supplier B', '', 'Atlanta', '2026-08-12'],
        ['a@example.com', 'A', '', '', 'training', 'Supplier C partner training', 'Supplier C', '', '', '2026-08-19'],
      ),
      TODAY,
    )
    expect(rows.map((r) => [r.activity.type, r.activity.location])).toEqual([
      ['in_person_training', 'Atlanta'],
      ['virtual_training', null],
      ['virtual_training', null],
    ])
    expect(notes).toEqual([expect.stringMatching(/^Row 4: no format, so it’s stored as a virtual training/)])
    expect(readAttendance(csv(['a@example.com', 'A', '', '', 'training', 'X workshop', '', '', '', '2026-08-19']), TODAY).virtualByDefault).toBe(1)
  })

  it('makes a Hub course one undated activity, with the day on the stamp', () => {
    const { rows } = readAttendance(csv(['a@example.com', 'A', '', '', 'hub_training', 'Video room design', 'Supplier B', '', '', '2026-10-01']), TODAY)
    expect(rows[0].activity).toMatchObject({ type: 'hub_training', event_date: null })
    expect(rows[0].earned_at).toBe('2026-10-01')
  })

  it('puts a quota row under the year’s quota, title or not', () => {
    const { rows } = readAttendance(csv(['a@example.com', 'A', '', '', 'quota', '', '', '', '', '2026-11-20']), TODAY)
    expect(rows[0].activity).toEqual({ type: 'quota', title: QUOTA_TITLE, supplier: null, location: null, event_date: null })
  })

  it('leaves out rows it can’t use, and says why', () => {
    const [fall] = CLUB_EXPRESS
    const { rows, skipped } = readAttendance(
      csv(
        ['', 'No Email', '', '', 'supplier_fair', 'Fall Supplier Fair', '', '', '', '2026-09-24'],
        ['b@example.com', '', '', '', 'supplier_fair', 'Fall Supplier Fair', '', '', '', '2026-09-24'],
        ['b@example.com', 'B', '', '', 'supplier_fair', 'Fall Supplier Fair', '', '', '', 'TBD'],
        ['b@example.com', 'B', '', '', 'supplier_fair', 'Winter Supplier Fair', '', '', '', '2026-12-09'],
        ['b@example.com', 'B', '', '', 'supplier_fair', 'Old Fair', '', '', '', '2026-05-01'],
        ['b@example.com', 'B', '', '', 'club_express', 'Regional kickoff', '', '', '', '2026-11-02'],
        ['b@example.com', 'B', '', '', 'webinar', 'Something', '', '', '', '2026-09-24'],
        ['b@example.com', 'B', '', '', 'club_express', fall.title, '', '', '', fall.date],
        ['b@example.com', 'B', '', '', 'club_express', 'club express, fall', '', '', '', fall.date],
      ),
      TODAY,
    )
    expect(rows).toHaveLength(1)
    expect(skipped.map((s) => s.replace(/:.*/, ''))).toEqual(['Row 2', 'Row 3', 'Row 4', 'Row 5', 'Row 6', 'Row 7', 'Row 8', 'Row 10'])
    expect(skipped[6]).toMatch(/no activity type it knows \(“webinar”\)/)
    expect(skipped[3]).toMatch(/hasn’t happened yet/)
    expect(skipped[4]).toMatch(/outside FY27/)
    expect(skipped[5]).toMatch(/isn’t either Club Express session/)
    expect(skipped[7]).toMatch(/already has “Club Express Fall” on row 9/)
  })

  it('treats titles that differ only in case or punctuation as one event', () => {
    const { rows, skipped } = readAttendance(
      csv(
        ['a@example.com', 'A', '', '', 'supplier_fair', 'Fall Supplier Fair', '', '', 'Atlanta', '2026-09-24'],
        ['b@example.com', 'B', '', '', 'supplier_fair', 'fall supplier fair!', '', '', 'Atlanta', '2026-09-24'],
      ),
      TODAY,
    )
    expect(skipped).toEqual([])
    expect(rows.map((r) => r.activity.title)).toEqual(['Fall Supplier Fair', 'Fall Supplier Fair'])
  })

  it('uses a rep’s first name and team, and notes a row that disagrees', () => {
    const { rows, notes } = readAttendance(
      csv(
        ['a@example.com', 'Ana Lee', 'POSB', '', 'supplier_fair', 'Fall Supplier Fair', '', '', '', '2026-09-24'],
        ['a@example.com', 'Ana Li', 'NetSec', '', 'supplier_fair', 'Winter Supplier Fair', '', '', '', '2026-11-05'],
      ),
      TODAY,
    )
    expect(rows.map((r) => [r.name, r.team])).toEqual([
      ['Ana Lee', 'POSB'],
      ['Ana Lee', 'POSB'],
    ])
    expect(notes).toEqual([expect.stringMatching(/^Row 3: name “Ana Li”, team “NetSec” for a@example.com differs from row 2/)])
  })
})

describe('planImport', () => {
  const read = readAttendance(
    csv(
      ['ana@example.com', 'Ana Lee', 'POSB', '', 'supplier_fair', 'Fall Supplier Fair', '', '', 'Atlanta', '2026-09-24'],
      ['ana@example.com', 'Ana Lee', 'POSB', '', 'hub_training', 'Video room design', 'Supplier B', '', '', '2026-10-01'],
      ['ana@example.com', 'Ana Lee', 'POSB', '', 'quota', '', '', '', '', '2026-11-20'],
      ['ben@example.com', 'Ben Cho', 'NetSec', 'Acme', 'supplier_fair', 'fall supplier fair', '', '', '', '2026-09-24'],
    ),
    TODAY,
  )

  it('adds everything to an empty database', () => {
    const plan = planImport(read.rows, EMPTY)
    expect(plan.newReps.map((r) => r.email)).toEqual(['ana@example.com', 'ben@example.com'])
    // Each new rep gets a sign-in account.
    expect(plan.accounts).toEqual(['ana@example.com', 'ben@example.com'])
    expect(plan.newActivities.map((a) => a.type)).toEqual(['supplier_fair', 'hub_training', 'quota'])
    expect(plan.newStamps.map((s) => [s.email, s.type, s.source])).toEqual([
      ['ana@example.com', 'supplier_fair', 'import'],
      ['ana@example.com', 'hub_training', 'import'],
      ['ana@example.com', 'quota', 'admin'],
      ['ben@example.com', 'supplier_fair', 'import'],
    ])
    expect(planIsEmpty(plan)).toBe(false)
  })

  it('adds nothing when it has all already, so a rerun is a no-op', () => {
    const state: CurrentState = {
      reps: [
        { id: 'r1', email: 'ana@example.com', name: 'Ana Lee', team: 'POSB', company: null, user_id: 'u1' },
        { id: 'r2', email: 'ben@example.com', name: 'Ben Cho', team: 'NetSec', company: 'Acme', user_id: 'u2' },
      ],
      activities: [
        { id: 'a1', type: 'supplier_fair', title: 'Fall Supplier Fair', supplier: null, location: 'Atlanta', event_date: '2026-09-24' },
        { id: 'a2', type: 'hub_training', title: 'Video room design', supplier: 'Supplier B', location: null, event_date: null },
        { id: 'a3', type: 'quota', title: QUOTA_TITLE, supplier: null, location: null, event_date: null },
      ],
      stamps: [
        { rep_id: 'r1', activity_id: 'a1' },
        { rep_id: 'r1', activity_id: 'a2' },
        { rep_id: 'r1', activity_id: 'a3' },
        { rep_id: 'r2', activity_id: 'a1' },
      ],
    }
    const plan = planImport(read.rows, state)
    expect(planIsEmpty(plan)).toBe(true)
    expect([plan.sameReps, plan.sameActivities, plan.sameStamps]).toEqual([2, 3, 4])
  })

  it('updates a changed name or team but never blanks a field', () => {
    const state: CurrentState = {
      reps: [{ id: 'r1', email: 'ana@example.com', name: 'Ana Lee-Smith', team: 'NetSec', company: 'Kept Inc' }],
      activities: [],
      stamps: [],
    }
    const plan = planImport(read.rows, state)
    expect(plan.changedReps).toEqual([{ id: 'r1', email: 'ana@example.com', set: { name: 'Ana Lee', team: 'POSB' }, was: { name: 'Ana Lee-Smith', team: 'NetSec' } }])
  })

  it('reuses an existing activity whose title differs only in case, and keeps its details', () => {
    const state: CurrentState = {
      reps: [],
      activities: [{ id: 'a1', type: 'supplier_fair', title: 'FALL SUPPLIER FAIR', supplier: null, location: 'Atlanta, GA', event_date: '2026-09-24' }],
      stamps: [],
    }
    const plan = planImport(read.rows, state)
    expect(plan.newActivities.map((a) => a.type)).toEqual(['hub_training', 'quota'])
    expect(plan.activityIds.get('supplier_fair|Fall Supplier Fair|2026-09-24')).toBe('a1')
    expect(plan.notes).toEqual([expect.stringMatching(/“FALL SUPPLIER FAIR” is already in the database, so its city “Atlanta” \(it has “Atlanta, GA”\) is left as it is/)])
  })

  it('makes a sign-in account only for reps who aren’t linked to one', () => {
    const state: CurrentState = {
      reps: [
        { id: 'r1', email: 'ana@example.com', name: 'Ana Lee', team: 'POSB', company: null, user_id: 'u1' },
        { id: 'r2', email: 'ben@example.com', name: 'Ben Cho', team: 'NetSec', company: 'Acme', user_id: null },
      ],
      activities: [],
      stamps: [],
    }
    expect(planImport(read.rows, state).accounts).toEqual(['ben@example.com'])
  })

  it('only adds the stamps a rep doesn’t have yet', () => {
    const state: CurrentState = {
      reps: [{ id: 'r1', email: 'ana@example.com', name: 'Ana Lee', team: 'POSB', company: null }],
      activities: [{ id: 'a1', type: 'supplier_fair', title: 'Fall Supplier Fair', supplier: null, location: 'Atlanta', event_date: '2026-09-24' }],
      stamps: [{ rep_id: 'r1', activity_id: 'a1' }],
    }
    const plan = planImport(read.rows, state)
    expect(plan.sameStamps).toBe(1)
    expect(plan.newStamps.map((s) => `${s.email} ${s.type}`)).toEqual(['ana@example.com hub_training', 'ana@example.com quota', 'ben@example.com supplier_fair'])
  })
})
