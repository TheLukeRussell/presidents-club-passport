// Turns the two tabs (reps, and the stamps they've earned) into reps with
// their stamps in date order. Everything else reads this.

import type { Activity } from '../config'
import type { PassportData, StampRow, TrainingFormat } from '../data/types'

export interface Rep {
  id: string // url-safe, from the email
  email: string
  name: string
  team: string
  start: string // YYYY-MM-DD, '' when they were here all year
}

export interface Stamp {
  // Names the event, so everyone stamped at the same fair shares it. Also
  // seeds the stamp's tilt, so it never jumps between reloads.
  id: string
  email: string
  activity: Activity
  event: string
  supplier: string
  date: string // YYYY-MM-DD
  format: TrainingFormat | ''
  location: string
}

export interface Model {
  reps: Rep[] // sorted by name
  stamps: Stamp[] // everyone's, sorted by date
  byRep: Map<string, Stamp[]> // by email, each sorted by date
}

const NONE: Stamp[] = []

// The part before the @, lowercased, dots and anything odd turned into hyphens.
// jo.smith@example.com becomes jo-smith. Good enough for a shareable URL.
export function repIdFromEmail(email: string): string {
  return email
    .split('@')[0]
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

const slug = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

export function stampFrom(row: StampRow): Stamp {
  return {
    id: `${row.activity}-${row.date}-${slug(row.event)}`,
    email: row.rep_email,
    activity: row.activity,
    event: row.event,
    supplier: row.supplier,
    date: row.date,
    format: row.format,
    location: row.location,
  }
}

const byDate = (a: Stamp, b: Stamp) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)

function group(stamps: Stamp[]): Map<string, Stamp[]> {
  const byRep = new Map<string, Stamp[]>()
  for (const stamp of stamps) {
    const list = byRep.get(stamp.email)
    if (list) list.push(stamp)
    else byRep.set(stamp.email, [stamp])
  }
  return byRep
}

export function buildModel(data: PassportData): Model {
  const reps = data.reps.map((row) => ({
    id: repIdFromEmail(row.rep_email),
    email: row.rep_email,
    name: row.rep_name,
    team: row.team,
    start: row.start_date,
  }))
  const emails = new Set(reps.map((rep) => rep.email))
  const stamps = data.stamps
    .filter((row) => emails.has(row.rep_email))
    .map(stampFrom)
    .sort(byDate)
  return { reps: reps.sort((a, b) => a.name.localeCompare(b.name)), stamps, byRep: group(stamps) }
}

export function stampsOf(model: Model, rep: Rep): Stamp[] {
  return model.byRep.get(rep.email) ?? NONE
}

export function findRep(model: Model, repId: string): Rep | undefined {
  return model.reps.find((rep) => rep.id === repId)
}

// The demo's Record. Returns a new model with these stamps added. A rep who
// already has the same stamp doesn't get it twice.
export function withStamps(model: Model, rows: StampRow[]): Model {
  const have = new Set(model.stamps.map((s) => `${s.email}|${s.id}`))
  const added = rows.map(stampFrom).filter((s) => !have.has(`${s.email}|${s.id}`))
  if (!added.length) return model
  const stamps = [...model.stamps, ...added].sort(byDate)
  return { ...model, stamps, byRep: group(stamps) }
}
