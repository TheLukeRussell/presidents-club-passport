// Tests for the machine-readable strip.

import { describe, expect, it } from 'vitest'
import { EXPIRY_DATE, ISSUE_DATE, TEAMS } from '../config'
import { checkDigit, mrzLines, type MrzInput } from './mrz'

describe('checkDigit', () => {
  it('matches the worked examples from the passport spec', () => {
    expect(checkDigit('L898902C3')).toBe('6')
    expect(checkDigit('740812')).toBe('2')
    expect(checkDigit('120415')).toBe('9')
  })
  it('treats filler as zero', () => {
    expect(checkDigit('<<<<')).toBe('0')
  })
})

describe('mrzLines', () => {
  // Hannah before Record: nothing met, six stamps, 53rd.
  const base: MrzInput = {
    name: 'Hannah Kowalski',
    team: 'Communications',
    met: 0,
    stamps: 6,
    quota: false,
    rank: 53,
    issue: ISSUE_DATE,
    expiry: EXPIRY_DATE,
  }

  it('makes two lines of 44 from the strip’s own characters', () => {
    for (const line of mrzLines(base)) {
      expect(line).toHaveLength(44)
      expect(line).toMatch(/^[A-Z0-9<]+$/)
    }
  })

  it('puts the surname first, then given names', () => {
    expect(mrzLines(base)[0]).toBe('P<PCPKOWALSKI<<HANNAH'.padEnd(44, '<'))
  })

  it('packs the document number, team, dates and stats into line two', () => {
    const two = mrzLines(base)[1]
    expect(two.startsWith('HKOWALSKI')).toBe(true)
    expect(two.slice(10, 13)).toBe('COM')
    expect(two.slice(13, 19)).toBe('260701')
    expect(two.slice(21, 27)).toBe('270630')
    expect(two).toContain('M0S06Q0K053')
  })

  it('carries each check digit in its place', () => {
    const two = mrzLines(base)[1]
    expect(two[9]).toBe(checkDigit(two.slice(0, 9)))
    expect(two[19]).toBe(checkDigit('260701'))
    expect(two[27]).toBe(checkDigit('270630'))
    expect(two[42]).toBe(checkDigit(two.slice(28, 42)))
    expect(two[43]).toBe(checkDigit(two.slice(0, 10) + two.slice(13, 20) + two.slice(21, 43)))
  })

  it('marks the gold seal and every minimum met', () => {
    expect(mrzLines({ ...base, met: 5, stamps: 11, quota: true, rank: 1 })[1]).toContain('M5S11Q1K001')
  })

  it('fits a three digit rank, and holds big numbers at their cap', () => {
    const two = mrzLines({ ...base, rank: 293 })[1]
    expect(two).toContain('K293')
    expect(two).toHaveLength(44)
    // Past 999 it holds at 999, and past 99 stamps at 99, instead of spilling.
    const big = mrzLines({ ...base, stamps: 140, rank: 1204 })[1]
    expect(big).toContain('S99Q0K999')
    expect(big).toHaveLength(44)
  })

  it('fills a missing rank with filler', () => {
    expect(mrzLines({ ...base, rank: null })[1]).toContain('M0S06Q0K<<<')
  })

  it('strips accents', () => {
    const [one, two] = mrzLines({ ...base, name: 'Amélie Gagnon', team: 'Federal' })
    expect(one).toContain('GAGNON<<AMELIE')
    expect(two.startsWith('AGAGNON<<')).toBe(true)
    expect(two.slice(10, 13)).toBe('FED')
  })

  it('gives every team its own three letters', () => {
    const codes = TEAMS.map((team) => mrzLines({ ...base, team })[1].slice(10, 13))
    expect(codes).toEqual(['COM', 'POS', 'NET', 'CSC', 'FED'])
  })

  it('handles hyphens and long names without going over 44', () => {
    const [one, two] = mrzLines({ ...base, name: 'Maria-Luisa Fernandez-Castellanos de la Vega Montoya' })
    expect(one).toHaveLength(44)
    expect(two).toHaveLength(44)
    expect(one).not.toMatch(/[^A-Z0-9<]/)
  })
})
