// Writes public/data/passport.json, the sample data the demo runs on. It's
// shaped like the tracking sheet: a list of reps and a list of stamps.
// Run it with `npm run data`. It's seeded, so you get the same file every
// time unless you change the plan below or DATA_SEED in src/config.ts.
//
// Every name and event here is made up. Emails use example.com on purpose.

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CLUB_EXPRESS, DATA_SEED, DEMO_TODAY, EXPIRY_DATE, HUB_COURSES, ISSUE_DATE, TEAMS } from '../src/config.ts'
import type { RepRow, StampRow } from '../src/data/types.ts'
import { seededRandom, shuffled } from '../src/lib/random.ts'

type Team = (typeof TEAMS)[number]

interface PlannedTraining {
  date: string
  supplier: string
  format: 'virtual' | 'in person'
  location: string
  teams: readonly Team[] | 'all' // who it's for
}

// The fiscal year's supplier trainings before the demo's today. Virtual ones
// are for everyone. In-person ones are either at headquarters for everyone,
// or regional for the teams that sell that supplier. Every team gets at least
// five in-person chances, so the minimum of four is fair to all of them.
const TRAININGS: PlannedTraining[] = [
  { date: '2026-07-28', supplier: 'Honeywell', format: 'in person', location: 'Atlanta', teams: ['POSB', 'Federal'] },
  { date: '2026-08-12', supplier: 'Zebra', format: 'virtual', location: '', teams: 'all' },
  { date: '2026-08-26', supplier: 'HPE Aruba', format: 'in person', location: 'Dallas', teams: ['NetSec', 'Cisco'] },
  { date: '2026-09-23', supplier: 'Zebra', format: 'in person', location: 'Greenville', teams: 'all' },
  { date: '2026-10-07', supplier: 'HPE Aruba', format: 'virtual', location: '', teams: 'all' },
  { date: '2026-10-21', supplier: 'HP Poly', format: 'in person', location: 'Chicago', teams: ['Communications', 'Cisco'] },
  { date: '2026-12-02', supplier: 'Datalogic', format: 'in person', location: 'Atlanta', teams: ['POSB'] },
  { date: '2026-12-09', supplier: 'HP Poly', format: 'virtual', location: '', teams: 'all' },
  { date: '2027-01-20', supplier: 'Cisco', format: 'in person', location: 'Greenville', teams: 'all' },
  { date: '2027-02-10', supplier: 'Cisco', format: 'virtual', location: '', teams: 'all' },
  { date: '2027-02-24', supplier: 'ASSA ABLOY', format: 'in person', location: 'Washington', teams: ['NetSec', 'Federal'] },
  { date: '2027-03-17', supplier: 'Panasonic', format: 'in person', location: 'Greenville', teams: 'all' },
  { date: '2027-04-14', supplier: 'Honeywell', format: 'virtual', location: '', teams: 'all' },
  { date: '2027-04-21', supplier: 'Juniper', format: 'in person', location: 'Denver', teams: ['NetSec', 'Cisco', 'Communications'] },
  { date: '2027-05-19', supplier: 'Brady', format: 'in person', location: 'Phoenix', teams: ['POSB', 'Federal'] },
]

// Supplier fairs before today. The summer fair is today (see DEMO_EVENTS).
const FAIRS = [
  { date: '2026-09-10', event: 'Fall Supplier Fair', location: 'Atlanta' },
  { date: '2026-12-03', event: 'Winter Supplier Fair', location: 'Dallas' },
  { date: '2027-03-04', event: 'Spring Supplier Fair', location: 'Chicago' },
]

interface PlannedRep {
  name: string
  team: Team
  // How many of each they've done by today. The seed picks which ones.
  // Picked by hand so the board tells a story: a clear first, a two-way tie
  // for second, a big tie further down, a few who missed Club Express Fall
  // and can't qualify this year, and Hannah, who has all of it to do today.
  inPerson: number
  virtual: number
  fairs: number
  hub: number
  clubFall: boolean
  startDate?: string
}

const REPS: PlannedRep[] = [
  { name: 'Owen Fitzgerald', team: 'Communications', inPerson: 5, virtual: 3, fairs: 2, hub: 3, clubFall: true },
  { name: 'Sofia Marchetti', team: 'Communications', inPerson: 4, virtual: 2, fairs: 3, hub: 2, clubFall: true },
  { name: 'Talia Ross', team: 'Communications', inPerson: 4, virtual: 4, fairs: 2, hub: 2, clubFall: true },
  { name: 'Victor Huang', team: 'Communications', inPerson: 3, virtual: 4, fairs: 2, hub: 3, clubFall: true },
  { name: 'Rosa Delgado', team: 'Communications', inPerson: 5, virtual: 1, fairs: 2, hub: 1, clubFall: true },
  { name: 'Devon Price', team: 'Communications', inPerson: 4, virtual: 2, fairs: 1, hub: 2, clubFall: true },
  // Three in person, one fair, one Hub course and Club Express Fall: one of
  // each short, so every Record button lands a stamp in an open slot.
  { name: 'Hannah Kowalski', team: 'Communications', inPerson: 3, virtual: 0, fairs: 1, hub: 1, clubFall: true },
  { name: 'Imani Carter', team: 'Communications', inPerson: 4, virtual: 3, fairs: 2, hub: 2, clubFall: true },
  { name: 'Wren Castillo', team: 'Communications', inPerson: 2, virtual: 3, fairs: 2, hub: 0, clubFall: true },
  { name: 'Caleb Turner', team: 'Communications', inPerson: 2, virtual: 2, fairs: 1, hub: 1, clubFall: true },
  { name: 'Mira Kapoor', team: 'Communications', inPerson: 3, virtual: 1, fairs: 2, hub: 2, clubFall: true },
  { name: 'Jonah Becker', team: 'Communications', inPerson: 1, virtual: 2, fairs: 1, hub: 0, clubFall: false },

  { name: 'Jordan Hale', team: 'POSB', inPerson: 6, virtual: 5, fairs: 3, hub: 4, clubFall: true }, // the most stamps
  { name: 'Priya Natarajan', team: 'POSB', inPerson: 5, virtual: 4, fairs: 3, hub: 2, clubFall: true },
  { name: 'Marcus Bell', team: 'POSB', inPerson: 6, virtual: 3, fairs: 2, hub: 3, clubFall: true },
  { name: 'Elena Ruiz', team: 'POSB', inPerson: 5, virtual: 3, fairs: 2, hub: 2, clubFall: true },
  { name: 'Paige Holloway', team: 'POSB', inPerson: 4, virtual: 4, fairs: 2, hub: 2, clubFall: true },
  { name: 'Grace Nakamura', team: 'POSB', inPerson: 4, virtual: 2, fairs: 3, hub: 2, clubFall: true },
  { name: 'Felix Andersson', team: 'POSB', inPerson: 4, virtual: 3, fairs: 2, hub: 1, clubFall: true },
  { name: 'Kendra Wallace', team: 'POSB', inPerson: 3, virtual: 3, fairs: 2, hub: 2, clubFall: true },
  { name: 'Mateo Silva', team: 'POSB', inPerson: 4, virtual: 1, fairs: 1, hub: 2, clubFall: true },
  { name: 'Omar Haddad', team: 'POSB', inPerson: 3, virtual: 2, fairs: 2, hub: 1, clubFall: true },
  { name: 'Tessa Lund', team: 'POSB', inPerson: 2, virtual: 2, fairs: 1, hub: 1, clubFall: true },
  { name: 'Cole Ashby', team: 'POSB', inPerson: 2, virtual: 1, fairs: 1, hub: 1, clubFall: false },

  { name: 'Kai Morales', team: 'NetSec', inPerson: 5, virtual: 3, fairs: 2, hub: 3, clubFall: true },
  { name: 'Naomi Feld', team: 'NetSec', inPerson: 5, virtual: 3, fairs: 3, hub: 2, clubFall: true },
  { name: 'Rahul Mehta', team: 'NetSec', inPerson: 4, virtual: 4, fairs: 2, hub: 2, clubFall: true },
  { name: 'Sam Whitlock', team: 'NetSec', inPerson: 4, virtual: 3, fairs: 2, hub: 2, clubFall: true },
  { name: 'Harper Lindgren', team: 'NetSec', inPerson: 4, virtual: 3, fairs: 2, hub: 2, clubFall: true },
  { name: 'Ryan Lindqvist', team: 'NetSec', inPerson: 4, virtual: 2, fairs: 2, hub: 1, clubFall: true },
  { name: 'Isaac Patel', team: 'NetSec', inPerson: 3, virtual: 3, fairs: 2, hub: 2, clubFall: true },
  { name: 'Declan Shea', team: 'NetSec', inPerson: 4, virtual: 2, fairs: 1, hub: 2, clubFall: true },
  { name: 'Andre Thomas', team: 'NetSec', inPerson: 3, virtual: 2, fairs: 2, hub: 1, clubFall: true },
  { name: 'Lena Hoffmann', team: 'NetSec', inPerson: 2, virtual: 3, fairs: 1, hub: 2, clubFall: true },
  { name: 'Gabriel Okafor', team: 'NetSec', inPerson: 3, virtual: 1, fairs: 1, hub: 1, clubFall: true },
  { name: 'Yuki Tanaka', team: 'NetSec', inPerson: 2, virtual: 1, fairs: 1, hub: 0, clubFall: false },

  { name: 'Tyler Brooks', team: 'Cisco', inPerson: 5, virtual: 3, fairs: 2, hub: 2, clubFall: true },
  { name: 'Theo Vance', team: 'Cisco', inPerson: 4, virtual: 4, fairs: 2, hub: 2, clubFall: true },
  { name: 'Janelle Moss', team: 'Cisco', inPerson: 4, virtual: 3, fairs: 3, hub: 2, clubFall: true },
  { name: 'Arjun Rao', team: 'Cisco', inPerson: 4, virtual: 2, fairs: 2, hub: 3, clubFall: true },
  { name: 'Lucia Romero', team: 'Cisco', inPerson: 5, virtual: 2, fairs: 1, hub: 2, clubFall: true },
  { name: 'Brianna Cole', team: 'Cisco', inPerson: 4, virtual: 3, fairs: 2, hub: 1, clubFall: true },
  { name: 'Leah Abramson', team: 'Cisco', inPerson: 3, virtual: 4, fairs: 2, hub: 2, clubFall: true },
  { name: 'Malik Grant', team: 'Cisco', inPerson: 4, virtual: 1, fairs: 2, hub: 1, clubFall: true },
  { name: 'Bea Sorensen', team: 'Cisco', inPerson: 3, virtual: 2, fairs: 1, hub: 1, clubFall: true },
  { name: 'Megan Doyle', team: 'Cisco', inPerson: 2, virtual: 2, fairs: 2, hub: 1, clubFall: true },
  { name: 'Diego Serrano', team: 'Cisco', inPerson: 2, virtual: 1, fairs: 1, hub: 1, clubFall: true },
  { name: 'Chloe Whitaker', team: 'Cisco', inPerson: 1, virtual: 1, fairs: 1, hub: 0, clubFall: false },

  { name: 'Liam Tremblay', team: 'Federal', inPerson: 5, virtual: 3, fairs: 2, hub: 2, clubFall: true },
  { name: 'Ethan Park', team: 'Federal', inPerson: 4, virtual: 2, fairs: 2, hub: 2, clubFall: true },
  { name: 'Aisha Bello', team: 'Federal', inPerson: 4, virtual: 3, fairs: 2, hub: 1, clubFall: true },
  { name: 'Amélie Gagnon', team: 'Federal', inPerson: 4, virtual: 2, fairs: 1, hub: 2, clubFall: true },
  { name: 'Desmond Reyes', team: 'Federal', inPerson: 3, virtual: 3, fairs: 2, hub: 2, clubFall: true },
  { name: 'Noah Singh', team: 'Federal', inPerson: 4, virtual: 2, fairs: 2, hub: 0, clubFall: true },
  { name: 'Ingrid Solberg', team: 'Federal', inPerson: 3, virtual: 2, fairs: 2, hub: 1, clubFall: true },
  { name: 'Zoe MacLeod', team: 'Federal', inPerson: 3, virtual: 3, fairs: 1, hub: 2, clubFall: true },
  { name: 'Fiona Brennan', team: 'Federal', inPerson: 2, virtual: 2, fairs: 2, hub: 1, clubFall: true },
  { name: 'Ben Okoro', team: 'Federal', inPerson: 2, virtual: 2, fairs: 1, hub: 1, clubFall: true },
  { name: 'Nadia Kerr', team: 'Federal', inPerson: 1, virtual: 1, fairs: 1, hub: 1, clubFall: false },
  // New hire. One Hub course since she started, and Club Express Fall was
  // before her time, so she can't qualify this year.
  { name: 'Clara Dubois', team: 'Federal', inPerson: 0, virtual: 0, fairs: 0, hub: 1, clubFall: false, startDate: '2027-06-01' },
]

function emailFor(name: string): string {
  const clean = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]+/g, '.')
  return `${clean}@example.com`
}

function isWeekday(date: string): boolean {
  const [y, m, d] = date.split('-').map(Number)
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return day !== 0 && day !== 6
}

// Fail loudly if someone edits the plan into something the demo can't use.
function check(condition: boolean, message: string): void {
  if (!condition) throw new Error(`generate-data: ${message}`)
}

const inYear = (date: string) => date >= ISSUE_DATE && date < DEMO_TODAY && date <= EXPIRY_DATE
const forTeam = (t: PlannedTraining, team: Team) => t.teams === 'all' || t.teams.includes(team)

check([...TRAININGS, ...FAIRS].every((t) => inYear(t.date) && isWeekday(t.date)), 'every event must be a weekday this fiscal year, before today')
check(CLUB_EXPRESS[0].date < DEMO_TODAY && CLUB_EXPRESS[1].date === DEMO_TODAY, 'Club Express Fall is past and Spring is today')
for (const team of TEAMS) {
  const chances = TRAININGS.filter((t) => t.format === 'in person' && forTeam(t, team)).length
  check(chances >= 5, `${team} only gets ${chances} in-person trainings`)
  check(REPS.filter((r) => r.team === team).length === 12, `${team} needs 12 reps`)
}
check(REPS.length === 60, 'expected 60 reps')
check(new Set(REPS.map((r) => emailFor(r.name))).size === REPS.length, 'two reps share an email')

const random = seededRandom(DATA_SEED)

// A weekday between two dates, inclusive, from the seed.
function dayBetween(from: string, to: string): string {
  const start = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10))
  const end = Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10))
  for (;;) {
    const date = new Date(start + Math.floor(random() * ((end - start) / 86400000 + 1)) * 86400000).toISOString().slice(0, 10)
    if (isWeekday(date)) return date
  }
}

const reps: RepRow[] = []
const stamps: StampRow[] = []

for (const rep of REPS) {
  const email = emailFor(rep.name)
  const start = rep.startDate ?? ''
  reps.push({ rep_email: email, rep_name: rep.name, team: rep.team, start_date: start })
  const open = (date: string) => !start || date >= start
  const pick = <T,>(items: T[], n: number, what: string) => {
    check(n <= items.length, `${rep.name} can't have ${n} ${what} out of ${items.length}`)
    return shuffled(items, random).slice(0, n)
  }

  const inPerson = TRAININGS.filter((t) => t.format === 'in person' && forTeam(t, rep.team) && open(t.date))
  const virtual = TRAININGS.filter((t) => t.format === 'virtual' && open(t.date))
  for (const t of [...pick(inPerson, rep.inPerson, 'in-person trainings'), ...pick(virtual, rep.virtual, 'virtual trainings')]) {
    const event = t.format === 'in person' ? `${t.supplier} solutions workshop` : `${t.supplier} partner training`
    stamps.push({ rep_email: email, activity: 'training', event, supplier: t.supplier, date: t.date, format: t.format, location: t.location })
  }
  for (const f of pick(FAIRS.filter((f) => open(f.date)), rep.fairs, 'fairs')) {
    stamps.push({ rep_email: email, activity: 'fair', event: f.event, supplier: '', date: f.date, format: 'in person', location: f.location })
  }
  // Hub courses are self-paced, so each one lands on its own day. The last
  // course in the list is left for the demo's Record to pick.
  for (const c of pick([...HUB_COURSES].slice(0, -1), rep.hub, 'Hub courses')) {
    const date = dayBetween(start || ISSUE_DATE, '2027-06-15')
    stamps.push({ rep_email: email, activity: 'hub', event: c.event, supplier: c.supplier, date, format: '', location: '' })
  }
  if (rep.clubFall) {
    check(open(CLUB_EXPRESS[0].date), `${rep.name} started after Club Express Fall`)
    stamps.push({ rep_email: email, activity: 'club', event: CLUB_EXPRESS[0].title, supplier: '', date: CLUB_EXPRESS[0].date, format: 'in person', location: 'Greenville' })
  }
}

reps.sort((a, b) => a.rep_name.localeCompare(b.rep_name))
stamps.sort((a, b) => a.date.localeCompare(b.date) || a.rep_email.localeCompare(b.rep_email) || a.event.localeCompare(b.event))

// One row per line keeps the file readable and the diffs small.
const lines = (rows: object[]) => rows.map((row) => '    ' + JSON.stringify(row)).join(',\n')
const json = `{\n  "reps": [\n${lines(reps)}\n  ],\n  "stamps": [\n${lines(stamps)}\n  ]\n}\n`
const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data')
mkdirSync(dir, { recursive: true })
writeFileSync(join(dir, 'passport.json'), json)
console.log(`Wrote ${reps.length} reps and ${stamps.length} stamps to public/data/passport.json`)
