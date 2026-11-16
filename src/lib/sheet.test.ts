// Tests for reading the tracking sheet: header spellings, blank rows, the
// ways people type an activity, a format or a date, and the notes it leaves
// for rows it can't use.

import { describe, expect, it } from 'vitest'
import { cleanData, parseActivity, parseDate, parseFormat, tableToRecords, toRepRow, toStampRow } from './sheet'

describe('tableToRecords', () => {
  it('maps the header spellings people use onto the columns', () => {
    const header = [
      'Rep Email',
      'Full Name',
      'Business Unit',
      'Hire Date',
      'Type',
      'Event Name',
      'Vendor',
      'Date Attended',
      'In person or virtual',
      'City',
    ]
    const [record] = tableToRecords([header, header.map((_, i) => `v${i}`)])
    expect(Object.keys(record)).toEqual(['rep_email', 'rep_name', 'team', 'start_date', 'activity', 'event', 'supplier', 'date', 'format', 'location', '_row'])
  })

  it('knows the other spellings too', () => {
    const keys = (header: string[]) => Object.keys(tableToRecords([header, header])[0]).filter((key) => key !== '_row')
    expect(keys(['E-mail', 'Name', 'BU', 'Started'])).toEqual(['rep_email', 'rep_name', 'team', 'start_date'])
    expect(keys(['Email Address', 'Activity', 'Course', 'Partner', 'Date Completed', 'Delivery', 'Where'])).toEqual([
      'rep_email',
      'activity',
      'event',
      'supplier',
      'date',
      'format',
      'location',
    ])
    expect(keys(['  rep_email  ', 'KIND', 'Title'])).toEqual(['rep_email', 'activity', 'event'])
  })

  it('keeps a column it doesn’t know under its own tidied name', () => {
    expect(tableToRecords([['Email', 'Notes for HR'], ['a@example.com', 'hi']])).toEqual([{ rep_email: 'a@example.com', notes_for_hr: 'hi', _row: 2 }])
  })

  // Ben is on row 6 of the sheet, blank rows and all, so a problem with him
  // says row 6.
  it('skips blank rows and fills short ones, keeping each row’s number', () => {
    const records = tableToRecords([
      ['Email', 'Name', 'Team'],
      ['ana@example.com', 'Ana', 'POSB'],
      ['', '', ''],
      [null, '   ', undefined],
      [],
      ['ben@example.com', 'Ben'],
    ])
    expect(records).toEqual([
      { rep_email: 'ana@example.com', rep_name: 'Ana', team: 'POSB', _row: 2 },
      { rep_email: 'ben@example.com', rep_name: 'Ben', team: '', _row: 6 },
    ])
    expect(cleanData(records.map((r) => ({ ...r, rep_email: r.rep_name === 'Ben' ? 'nope' : r.rep_email })), []).problems).toEqual(['Reps row 6: no email'])
  })

  it('has nothing to give for an empty tab', () => {
    expect(tableToRecords([])).toEqual([])
    expect(tableToRecords([['Email', 'Name']])).toEqual([])
  })
})

describe('parseActivity', () => {
  it('takes the five names as they are', () => {
    expect(['training', 'fair', 'hub', 'club', 'quota'].map(parseActivity)).toEqual(['training', 'fair', 'hub', 'club', 'quota'])
  })

  it('reads the ways people write them', () => {
    const read = (values: string[]) => values.map(parseActivity)
    expect(read(['Supplier Training', 'Workshop', 'Training session', ' TRAINING '])).toEqual(['training', 'training', 'training', 'training'])
    expect(read(['Supplier Fair', 'fair'])).toEqual(['fair', 'fair'])
    expect(read(['Hub course', 'Hub training', 'HUB'])).toEqual(['hub', 'hub', 'hub'])
    expect(read(['Club Express', 'Express', 'Club Express Spring'])).toEqual(['club', 'club', 'club'])
    expect(read(['Sales growth quota', 'Quota', 'Growth'])).toEqual(['quota', 'quota', 'quota'])
  })

  it('gives up on anything else', () => {
    expect(parseActivity('lunch')).toBeNull()
    expect(parseActivity('')).toBeNull()
    expect(parseActivity(null)).toBeNull()
    expect(parseActivity(undefined)).toBeNull()
  })
})

describe('parseFormat', () => {
  it('reads in person and virtual however they’re typed', () => {
    for (const value of ['In person', 'in-person', 'IN PERSON', 'Onsite', 'On site', 'Live']) expect(parseFormat(value), value).toBe('in person')
    for (const value of ['Virtual', 'online', 'Remote', 'Webinar']) expect(parseFormat(value), value).toBe('virtual')
  })
  it('leaves anything else blank', () => {
    expect(parseFormat('')).toBe('')
    expect(parseFormat(null)).toBe('')
    expect(parseFormat('hybrid')).toBe('')
  })
})

describe('parseDate', () => {
  it('reads YYYY-MM-DD, with or without leading zeros or a time', () => {
    expect(parseDate('2027-06-17')).toBe('2027-06-17')
    expect(parseDate('2027-6-7')).toBe('2027-06-07')
    expect(parseDate('2027-06-17T14:30:00Z')).toBe('2027-06-17')
    expect(parseDate('  2027-06-17  ')).toBe('2027-06-17')
  })

  it('reads M/D/YYYY and two-digit years', () => {
    expect(parseDate('6/17/2027')).toBe('2027-06-17')
    expect(parseDate('06/07/2027')).toBe('2027-06-07')
    expect(parseDate('6/17/27')).toBe('2027-06-17')
    expect(parseDate('10/14/26')).toBe('2026-10-14')
  })

  it('reads Excel date numbers, as a number or as text', () => {
    expect(parseDate(46555)).toBe('2027-06-17')
    expect(parseDate('46555')).toBe('2027-06-17')
    expect(parseDate(46309)).toBe('2026-10-14')
    expect(parseDate(46204)).toBe('2026-07-01')
  })

  it('rejects days that don’t exist', () => {
    expect(parseDate('2027-02-30')).toBe('')
    expect(parseDate('2/30/2027')).toBe('')
    expect(parseDate('2027-02-29')).toBe('')
    expect(parseDate('2028-02-29')).toBe('2028-02-29')
    expect(parseDate('13/1/2027')).toBe('')
    expect(parseDate('2027-13-01')).toBe('')
  })

  it('gives up on anything else', () => {
    expect(parseDate('June 17')).toBe('')
    expect(parseDate('')).toBe('')
    expect(parseDate(null)).toBe('')
    expect(parseDate(undefined)).toBe('')
    expect(parseDate('17.06.2027')).toBe('')
  })

  // A bare number outside Excel's date range (a year, a zero) comes back as no date.
  it('reads a number outside the date range as no date, without throwing', () => {
    expect(parseDate(0)).toBe('')
    expect(parseDate(2027)).toBe('')
    expect(parseDate('2027')).toBe('')
    expect(parseDate(99999)).toBe('')
  })
})

describe('toRepRow', () => {
  it('tidies a rep and reads their start date', () => {
    expect(toRepRow({ rep_email: ' Ana.Lee@Example.com ', rep_name: ' Ana Lee ', team: ' POSB ', start_date: '6/1/2027' })).toEqual({
      rep_email: 'ana.lee@example.com',
      rep_name: 'Ana Lee',
      team: 'POSB',
      start_date: '2027-06-01',
    })
    expect(toRepRow({ rep_email: 'a@example.com', rep_name: 'Ana' })).toMatchObject({ team: '', start_date: '' })
  })
  it('says what’s missing', () => {
    expect(toRepRow({ rep_email: 'ana', rep_name: 'Ana' })).toBe('no email')
    expect(toRepRow({ rep_email: 'ana@example.com', rep_name: '  ' })).toBe('no name')
  })
})

describe('toStampRow', () => {
  const raw = { rep_email: 'Ana@Example.com', activity: 'Supplier training', event: 'Zebra solutions workshop', supplier: 'Zebra', date: '6/17/2027', format: 'In person', location: 'Greenville' }

  it('tidies a training and keeps its format', () => {
    expect(toStampRow(raw)).toEqual({
      rep_email: 'ana@example.com',
      activity: 'training',
      event: 'Zebra solutions workshop',
      supplier: 'Zebra',
      date: '2027-06-17',
      format: 'in person',
      location: 'Greenville',
    })
    expect(toStampRow({ ...raw, format: 'Webinar' })).toMatchObject({ format: 'virtual' })
    expect(toStampRow({ ...raw, format: '' })).toMatchObject({ format: '' })
  })

  it('puts fairs and Club Express in a room, and Hub courses nowhere', () => {
    expect(toStampRow({ ...raw, activity: 'Supplier fair', format: 'Virtual' })).toMatchObject({ activity: 'fair', format: 'in person' })
    expect(toStampRow({ ...raw, activity: 'Club Express', format: '' })).toMatchObject({ activity: 'club', format: 'in person' })
    expect(toStampRow({ ...raw, activity: 'Hub course', format: 'Virtual' })).toMatchObject({ activity: 'hub', format: '' })
  })

  it('names a quota row when nobody did', () => {
    expect(toStampRow({ ...raw, activity: 'Quota', event: '' })).toMatchObject({ activity: 'quota', event: 'Sales growth quota' })
  })

  it('says what’s wrong, quoting what was typed', () => {
    expect(toStampRow({ ...raw, rep_email: '' })).toBe('no email')
    expect(toStampRow({ ...raw, activity: 'lunch' })).toBe('no activity it knows (“lunch”)')
    expect(toStampRow({ ...raw, date: 'June 17' })).toBe('no date it can read (“June 17”)')
    expect(toStampRow({ ...raw, event: '  ' })).toBe('no event name')
  })
})

describe('cleanData', () => {
  const reps = [
    { rep_email: 'ana@example.com', rep_name: 'Ana', team: 'POSB', start_date: '' },
    { rep_email: 'nobody', rep_name: 'Nobody', team: 'POSB', start_date: '' },
    { rep_email: 'ben@example.com', rep_name: 'Ben', team: 'NetSec', start_date: '6/1/2027' },
    { rep_email: 'ANA@example.com', rep_name: 'Ana Again', team: 'Cisco', start_date: '' },
    { rep_email: 'cy@example.com', rep_name: '', team: 'POSB', start_date: '' },
  ]
  const training = { activity: 'training', event: 'Zebra solutions workshop', supplier: 'Zebra', date: '2027-03-17', format: 'in person', location: '' }
  const stamps = [
    { rep_email: 'ana@example.com', ...training },
    { rep_email: 'ghost@example.com', ...training },
    { rep_email: 'Ana@example.com', ...training, event: 'ZEBRA solutions workshop' },
    { rep_email: 'ben@example.com', ...training, format: '' },
    { rep_email: 'ben@example.com', ...training, activity: 'lunch' },
    { rep_email: 'ben@example.com', ...training, activity: 'fair', date: 'soon' },
    { rep_email: 'ben@example.com', ...training, date: '2027-04-21' },
  ]
  const { data, problems } = cleanData(reps, stamps)

  it('notes every row it skipped or fixed, with its sheet row number', () => {
    expect(problems).toEqual([
      'Reps row 3: no email',
      'Reps row 5: ana@example.com is listed twice',
      'Reps row 6: no name',
      'Stamps row 3: ghost@example.com isn’t on the Reps tab',
      'Stamps row 4: the same stamp is already on row 2',
      'Stamps row 5: no format, so it counts as virtual',
      'Stamps row 6: no activity it knows (“lunch”)',
      'Stamps row 7: no date it can read (“soon”)',
    ])
  })

  it('keeps the first copy of a rep and every stamp it can use', () => {
    expect(data.reps.map((r) => [r.rep_name, r.team, r.start_date])).toEqual([
      ['Ana', 'POSB', ''],
      ['Ben', 'NetSec', '2027-06-01'],
    ])
    expect(data.stamps.map((s) => [s.rep_email, s.date, s.format])).toEqual([
      ['ana@example.com', '2027-03-17', 'in person'],
      ['ben@example.com', '2027-03-17', ''],
      ['ben@example.com', '2027-04-21', 'in person'],
    ])
  })

  it('reads a whole sheet straight from its grids', () => {
    const repTab = [
      ['Rep Email', 'Rep Name', 'Team', 'Start Date'],
      ['hannah.kowalski@example.com', 'Hannah Kowalski', 'Communications', ''],
      ['', '', '', ''],
    ]
    const stampTab = [
      ['Email', 'Activity', 'Event', 'Supplier', 'Date', 'Format', 'Location'],
      ['hannah.kowalski@example.com', 'Supplier training', 'Pioneer solutions workshop', 'Pioneer', 46555, 'In person', 'Greenville'],
      ['hannah.kowalski@example.com', 'Club Express', 'Club Express Fall', '', '10/14/2026', '', 'Greenville'],
      ['hannah.kowalski@example.com', 'Sales growth quota', '', '', '6/30/27', '', ''],
    ]
    const clean = cleanData(tableToRecords(repTab), tableToRecords(stampTab))
    expect(clean.problems).toEqual([])
    expect(clean.data.reps).toHaveLength(1)
    expect(clean.data.stamps.map((s) => [s.activity, s.event, s.date, s.format])).toEqual([
      ['training', 'Pioneer solutions workshop', '2027-06-17', 'in person'],
      ['club', 'Club Express Fall', '2026-10-14', 'in person'],
      ['quota', 'Sales growth quota', '2027-06-30', ''],
    ])
  })
})
