// Tests for the CSV reader, including a full Excel-style export run through
// the sheet cleaner the way `npm run import` does it.

import { describe, expect, it } from 'vitest'
import { guessSeparator, parseCsv } from './csv'
import { cleanData, tableToRecords } from './sheet'

describe('parseCsv', () => {
  it('splits plain rows and fields', () => {
    expect(parseCsv('a,b,c\n1,2,3\n')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ])
  })

  it('keeps empty fields, including a trailing one', () => {
    expect(parseCsv('a,,c\n,,\nx,y,')).toEqual([
      ['a', '', 'c'],
      ['', '', ''],
      ['x', 'y', ''],
    ])
  })

  it('reads quoted fields', () => {
    expect(parseCsv('"Kowalski, Hannah","Greenville"\n')).toEqual([['Kowalski, Hannah', 'Greenville']])
  })

  it('turns doubled quotes into one', () => {
    expect(parseCsv('"The ""big"" fair",x\n""""\n')).toEqual([['The "big" fair', 'x'], ['"']])
  })

  it('keeps commas and line breaks inside quotes', () => {
    expect(parseCsv('"one, two","line 1\nline 2\r\nline 3",end\nnext,row,here')).toEqual([
      ['one, two', 'line 1\nline 2\r\nline 3', 'end'],
      ['next', 'row', 'here'],
    ])
  })

  it('treats an empty quoted field as empty', () => {
    expect(parseCsv('a,"",c\n"",""')).toEqual([
      ['a', '', 'c'],
      ['', ''],
    ])
  })

  it('reads CRLF line ends without leaving \\r on the last field', () => {
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('reads bare CR line ends too (old Excel for Mac)', () => {
    expect(parseCsv('a,b\r1,2\r')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('drops a UTF-8 BOM at the start', () => {
    const rows = parseCsv('﻿rep_email,rep_name\r\nx@example.com,Amélie\r\n')
    expect(rows[0][0]).toBe('rep_email')
    expect(rows[1][1]).toBe('Amélie')
  })

  it('keeps a BOM that isn’t at the start, since it’s then part of a cell', () => {
    expect(parseCsv('a,﻿b')).toEqual([['a', '﻿b']])
  })

  it('doesn’t add a row for the final line break, with or without one', () => {
    expect(parseCsv('a,b')).toEqual([['a', 'b']])
    expect(parseCsv('a,b\n')).toEqual([['a', 'b']])
    expect(parseCsv('a,b\r\n')).toEqual([['a', 'b']])
  })

  it('returns a blank line in the middle as one empty cell', () => {
    expect(parseCsv('a\n\nb\n')).toEqual([['a'], [''], ['b']])
  })

  it('returns nothing for empty text or a lone BOM', () => {
    expect(parseCsv('')).toEqual([])
    expect(parseCsv('﻿')).toEqual([])
  })

  it('doesn’t trim spaces, so the sheet cleaner decides', () => {
    expect(parseCsv(' a , "b" ')).toEqual([[' a ', ' "b" ']])
  })

  it('keeps a stray quote in the middle of a field', () => {
    expect(parseCsv('5" display,x')).toEqual([['5" display', 'x']])
  })

  it('keeps text after a closing quote', () => {
    expect(parseCsv('"ab"c,d')).toEqual([['abc', 'd']])
  })

  it('keeps the rest of the text when a quote never closes', () => {
    expect(parseCsv('a,"b,c\nd')).toEqual([['a', 'b,c\nd']])
  })

  it('splits on another separator when asked', () => {
    expect(parseCsv('a;"b;c";d\r\n1;2;3', ';')).toEqual([
      ['a', 'b;c', 'd'],
      ['1', '2', '3'],
    ])
    expect(parseCsv('a\tb\n1\t2', '\t')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })
})

describe('guessSeparator', () => {
  it('picks commas for a normal export', () => {
    expect(guessSeparator('rep_email,rep_name,team,start_date\r\n')).toBe(',')
  })
  it('picks semicolons when the header uses them', () => {
    expect(guessSeparator('﻿rep_email;rep_name;team;start_date\r\nx;y;z;w')).toBe(';')
  })
  it('picks tabs for a tab-delimited export', () => {
    expect(guessSeparator('rep_email\trep_name\tteam\n')).toBe('\t')
  })
  it('ignores separators inside quoted headers', () => {
    expect(guessSeparator('"a;b;c",d,e\n')).toBe(',')
  })
  it('falls back to commas for a single column', () => {
    expect(guessSeparator('rep_email\nx@example.com')).toBe(',')
    expect(guessSeparator('')).toBe(',')
  })
})

// What Excel's "CSV UTF-8" gives for the template's two tabs: a BOM, CRLF,
// the dropdown labels and dates as they show in the cell.
describe('a sheet export, end to end', () => {
  const reps = [
    '﻿rep_email,rep_name,team,start_date',
    'Sam.Sample@example.com,"Sample, Sam",POSB,',
    'pat.placeholder@example.com,Pat Placeholder,Federal,2027-06-01',
    ',,,',
    '',
  ].join('\r\n')
  const stamps = [
    '﻿rep_email,activity,event,supplier,date,format,location',
    'sam.sample@example.com,Supplier training,"Zebra ""mobility"" workshop",Zebra,2026-09-23,In person,Greenville',
    'sam.sample@example.com,Supplier fair,Fall Supplier Fair,,9/10/2026,,Atlanta',
    'sam.sample@example.com,Hub course,Meraki fundamentals,Cisco,2026-11-02,,',
    'pat.placeholder@example.com,Club Express,Club Express Spring,,2027-06-17,In person,Greenville',
    'pat.placeholder@example.com,Quota,,,2027-06-30,,',
    'nobody@example.com,Supplier training,Brady workshop,Brady,2027-05-19,In person,Phoenix',
    '',
  ].join('\r\n')

  const { data, problems } = cleanData(tableToRecords(parseCsv(reps)), tableToRecords(parseCsv(stamps)))

  it('keeps every real rep and skips the blank row', () => {
    expect(data.reps).toEqual([
      { rep_email: 'sam.sample@example.com', rep_name: 'Sample, Sam', team: 'POSB', start_date: '' },
      { rep_email: 'pat.placeholder@example.com', rep_name: 'Pat Placeholder', team: 'Federal', start_date: '2027-06-01' },
    ])
  })

  it('reads each stamp the way the passport needs it', () => {
    expect(data.stamps).toEqual([
      { rep_email: 'sam.sample@example.com', activity: 'training', event: 'Zebra "mobility" workshop', supplier: 'Zebra', date: '2026-09-23', format: 'in person', location: 'Greenville' },
      { rep_email: 'sam.sample@example.com', activity: 'fair', event: 'Fall Supplier Fair', supplier: '', date: '2026-09-10', format: 'in person', location: 'Atlanta' },
      { rep_email: 'sam.sample@example.com', activity: 'hub', event: 'Meraki fundamentals', supplier: 'Cisco', date: '2026-11-02', format: '', location: '' },
      { rep_email: 'pat.placeholder@example.com', activity: 'club', event: 'Club Express Spring', supplier: '', date: '2027-06-17', format: 'in person', location: 'Greenville' },
      { rep_email: 'pat.placeholder@example.com', activity: 'quota', event: 'Sales growth quota', supplier: '', date: '2027-06-30', format: '', location: '' },
    ])
  })

  it('names the row of a stamp for someone who isn’t on the Reps tab', () => {
    expect(problems).toEqual(['Stamps row 7: nobody@example.com isn’t on the Reps tab'])
  })
})
