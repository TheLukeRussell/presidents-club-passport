// Turns the tracking sheet into clean rows. A tab arrives as a grid of cells
// (Microsoft Graph's usedRange, or a CSV export), header row first. People type
// into this sheet by hand, so it forgives the usual: "Rep Email" for rep_email,
// "Supplier Fair" for fair, 6/17/2027 or an Excel date number for a date.
// Anything it can't use gets dropped with a note saying which row and why.

import { ACTIVITIES, TEAMS, type Activity } from '../config.ts'
import type { PassportData, RepRow, StampRow, TrainingFormat } from '../data/types.ts'

// Header spellings people actually use, mapped to the column they mean. A
// bare "Rep" column usually holds names, so it reads as rep_name.
const HEADERS: Record<string, string[]> = {
  rep_email: ['rep_email', 'email', 'e_mail', 'rep_e_mail', 'email_address'],
  rep_name: ['rep_name', 'name', 'full_name', 'rep'],
  team: ['team', 'business_unit', 'bu'],
  start_date: ['start_date', 'start', 'started', 'hire_date'],
  activity: ['activity', 'type', 'kind', 'stamp'],
  event: ['event', 'event_name', 'title', 'course', 'training'],
  supplier: ['supplier', 'vendor', 'partner'],
  date: ['date', 'date_attended', 'date_completed', 'attended', 'completed'],
  format: ['format', 'delivery', 'in_person_or_virtual'],
  location: ['location', 'city', 'where'],
}

const COLUMN_FOR = new Map(Object.entries(HEADERS).flatMap(([column, names]) => names.map((name) => [name, column])))

function headerKey(cell: unknown): string {
  const key = String(cell ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
  return COLUMN_FOR.get(key) ?? key
}

// A grid with its header row first becomes one object per row. Rows with
// nothing in them (the sheet's blank tail) are skipped, and each record keeps
// its sheet row number in _row, so a problem still points at the right row
// after a blank one. When two columns read as the same one ("Email" and
// "E-mail"), the first wins; columnClashes says which got ignored.
export function tableToRecords(values: readonly (readonly unknown[])[]): Record<string, unknown>[] {
  const [header, ...rows] = values
  if (!header) return []
  const keys = header.map(headerKey)
  const used = keys.flatMap((key, k) => (keys.indexOf(key) === k ? [k] : []))
  return rows.flatMap((row, i) =>
    row.some((cell) => String(cell ?? '').trim() !== '') ? [{ ...Object.fromEntries(used.map((k) => [keys[k], row[k] ?? ''])), _row: i + 2 }] : [],
  )
}

// Header cells that read as a column an earlier one already took, as notes:
// “E-mail” reads as rep_email too, so only “Email” is used.
export function columnClashes(header: readonly unknown[]): string[] {
  const first = new Map<string, string>()
  return header.flatMap((cell) => {
    const key = headerKey(cell)
    const name = String(cell ?? '').trim()
    if (!key) return []
    const taken = first.get(key)
    if (taken !== undefined) return [`“${name}” reads as ${key} too, so only “${taken}” is used`]
    first.set(key, name)
    return []
  })
}

// Activity names as people write them. Checked in order, first match wins.
const ACTIVITY_WORDS: [Activity, RegExp][] = [
  ['quota', /quota|growth/],
  ['club', /club|express/],
  ['hub', /hub/],
  ['fair', /fair/],
  ['training', /train|workshop|session/],
]

export function parseActivity(value: unknown): Activity | null {
  const text = String(value ?? '').trim().toLowerCase()
  if ((ACTIVITIES as readonly string[]).includes(text)) return text as Activity
  return ACTIVITY_WORDS.find(([, words]) => words.test(text))?.[0] ?? null
}

// Virtual words go first, so "Live webinar" or "Virtual (live)" can't pass
// for in person. Bare "live" says nothing either way, so it isn't read.
export function parseFormat(value: unknown): TrainingFormat | '' {
  const text = String(value ?? '').toLowerCase()
  if (/virtual|online|remote|webinar/.test(text)) return 'virtual'
  if (/person|onsite|on site/.test(text)) return 'in person'
  return ''
}

const pad = (n: number) => String(n).padStart(2, '0')

// YYYY-MM-DD, M/D/YYYY, either with a time after it (Excel writes date cells
// that way in some CSVs), or an Excel date number (days since the end of 1899,
// which is what Graph hands back for a date cell). Returns '' for anything else.
export function parseDate(value: unknown): string {
  // 20000 to 80000 is about 1954 to 2119: wide enough for any real date,
  // tight enough that a count or an ID isn't read as one.
  if (typeof value === 'number' && Number.isFinite(value) && value > 20000 && value < 80000) {
    // The fraction is the time of day, so 46555.6 is still June 17.
    const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86400000)
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
  }
  const text = String(value ?? '').trim()
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(text)
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})(?:\s+\d{1,2}:\d{2}\b.*)?$/.exec(text)
  let y: number, m: number, d: number
  if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])]
  else if (us) [m, d, y] = [Number(us[1]), Number(us[2]), Number(us[3].length === 2 ? `20${us[3]}` : us[3])]
  // Digits typed as text, like "46555", read as an Excel date number. A real
  // number that got this far is out of range, so it's no date at all.
  else if (typeof value !== 'number' && /^\d+(\.\d+)?$/.test(text)) return parseDate(Number(text))
  else return ''
  const check = new Date(Date.UTC(y, m - 1, d))
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) return ''
  return `${y}-${pad(m)}-${pad(d)}`
}

const text = (value: unknown) => String(value ?? '').trim()

export function toRepRow(raw: Record<string, unknown>): RepRow | string {
  const rep_email = text(raw.rep_email).toLowerCase()
  if (!rep_email.includes('@')) return 'no email'
  const rep_name = text(raw.rep_name)
  if (!rep_name) return 'no name'
  // "posb" or "NETSEC" still lands on the team's real name.
  const team = text(raw.team)
  const known = TEAMS.find((t) => t.toLowerCase() === team.toLowerCase())
  return { rep_email, rep_name, team: known ?? team, start_date: parseDate(raw.start_date) }
}

export function toStampRow(raw: Record<string, unknown>): StampRow | string {
  const rep_email = text(raw.rep_email).toLowerCase()
  if (!rep_email.includes('@')) return 'no email'
  const activity = parseActivity(raw.activity)
  if (!activity) return `no activity it knows (“${text(raw.activity)}”)`
  const date = parseDate(raw.date)
  if (!date) return `no date it can read (“${text(raw.date)}”)`
  // Fairs and Club Express happen in a room. Trainings say which they were,
  // and one that doesn't say is virtual, here and so everywhere after: it
  // can't count toward the in-person four, so it shouldn't look in person.
  // cleanData leaves a note for it.
  const format = activity === 'fair' || activity === 'club' ? 'in person' : activity === 'training' ? parseFormat(raw.format) || 'virtual' : ''
  const event = text(raw.event) || (activity === 'quota' ? 'Sales growth quota' : '')
  if (!event) return 'no event name'
  return { rep_email, activity, event, supplier: text(raw.supplier), date, format, location: text(raw.location) }
}

export interface Cleaned {
  data: PassportData
  problems: string[]
}

// The sheet row a record came from: _row from tableToRecords, or its place
// in the list when it came from JSON. Rows count the header, so the first
// data row is row 2.
const sheetRow = (raw: Record<string, unknown>, i: number) => (typeof raw._row === 'number' ? raw._row : i + 2)

// The rep plus the stamp's id as lib/model builds it (activity, day, and the
// event name slugged). It's a copy because the import script runs this file
// under plain Node, which can't follow model.ts's imports. A test keeps the
// two in step.
const slug = (name: string) =>
  name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
export const stampKey = (row: StampRow) => `${row.rep_email}|${row.activity}-${row.date}-${slug(row.event)}`

// Both tabs at once, so a stamp for an email that isn't on the Reps tab can be
// caught, and the same stamp typed in twice only counts once. "The same" is
// whatever gives the same stamp id (rep, activity, day, and the event name
// with case and punctuation aside), so this check and the passport agree.
export function cleanData(reps: Record<string, unknown>[], stamps: Record<string, unknown>[]): Cleaned {
  const problems: string[] = []
  const repRows = new Map<string, RepRow>()
  reps.forEach((raw, i) => {
    const at = sheetRow(raw, i)
    const row = toRepRow(raw)
    if (typeof row === 'string') problems.push(`Reps row ${at}: ${row}`)
    else if (repRows.has(row.rep_email)) problems.push(`Reps row ${at}: ${row.rep_email} is listed twice`)
    else repRows.set(row.rep_email, row)
  })
  const seen = new Map<string, { at: number; supplier: string }>()
  const stampRows: StampRow[] = []
  stamps.forEach((raw, i) => {
    const at = sheetRow(raw, i)
    const row = toStampRow(raw)
    if (typeof row === 'string') return void problems.push(`Stamps row ${at}: ${row}`)
    if (!repRows.has(row.rep_email)) return void problems.push(`Stamps row ${at}: ${row.rep_email} isn’t on the Reps tab`)
    const key = stampKey(row)
    const first = seen.get(key)
    if (first) {
      // Two suppliers' sessions on one day under one name really are two
      // trainings, but the passport only tells stamps apart by name.
      const other = first.supplier && row.supplier && first.supplier.toLowerCase() !== row.supplier.toLowerCase()
      return void problems.push(
        other
          ? `Stamps row ${at}: same event and day as row ${first.at} but ${row.supplier}, not ${first.supplier}, so it’s left out. Give each session its own event name to keep both`
          : `Stamps row ${at}: the same stamp is already on row ${first.at}`,
      )
    }
    if (row.activity === 'training' && !parseFormat(raw.format)) {
      const typed = text(raw.format)
      problems.push(`Stamps row ${at}: ${typed ? `no format it knows (“${typed}”)` : 'no format'}, so it counts as virtual`)
    }
    seen.set(key, { at, supplier: row.supplier })
    stampRows.push(row)
  })
  return { data: { reps: [...repRows.values()], stamps: stampRows }, problems }
}
