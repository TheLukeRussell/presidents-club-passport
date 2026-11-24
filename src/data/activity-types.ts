// How the app's five activities (src/config.ts) line up with the six stamp
// types in Supabase's activities table. The app keeps one "training" activity
// and tells in-person from virtual by each stamp's format. The database makes
// them two types instead, so a virtual training can never be counted toward
// the in-person four by a query that forgets to check the format.
//
// The seed script, the attendance importer and the front end all go through
// here, so the mapping lives in one place. Imports carry .ts extensions so
// the Node scripts can load this file directly.

import { CLUB_EXPRESS, FISCAL_YEAR, type Activity } from '../config.ts'
import type { StampRow, TrainingFormat } from './types.ts'

export const ACTIVITY_TYPES = [
  'in_person_training',
  'virtual_training',
  'supplier_fair',
  'hub_training',
  'club_express',
  'quota',
] as const

export type ActivityType = (typeof ACTIVITY_TYPES)[number]

export const isActivityType = (value: unknown): value is ActivityType =>
  typeof value === 'string' && (ACTIVITY_TYPES as readonly string[]).includes(value)

// The database type for a stamp the app knows. A training with no format is
// virtual, the same rule the sheet parser uses: it can't count toward the
// in-person four, so it shouldn't be stored as in person either.
export function activityTypeOf(activity: Activity, format: TrainingFormat | ''): ActivityType {
  switch (activity) {
    case 'training':
      return format === 'in person' ? 'in_person_training' : 'virtual_training'
    case 'fair':
      return 'supplier_fair'
    case 'hub':
      return 'hub_training'
    case 'club':
      return 'club_express'
    case 'quota':
      return 'quota'
  }
}

// And back: what the passport needs to draw a stamp of this type. Fairs and
// Club Express happen in a room, Hub courses and the quota have no format.
export function activityOf(type: ActivityType): { activity: Activity; format: TrainingFormat | '' } {
  switch (type) {
    case 'in_person_training':
      return { activity: 'training', format: 'in person' }
    case 'virtual_training':
      return { activity: 'training', format: 'virtual' }
    case 'supplier_fair':
      return { activity: 'fair', format: 'in person' }
    case 'hub_training':
      return { activity: 'hub', format: '' }
    case 'club_express':
      return { activity: 'club', format: 'in person' }
    case 'quota':
      return { activity: 'quota', format: '' }
  }
}

// Hub courses are self-paced and the quota isn't an event, so their
// activities have no date: the day lives on each rep's stamp instead.
export const isUndated = (type: ActivityType) => type === 'hub_training' || type === 'quota'

// The year's one quota activity. Every rep's quota stamp points at it, so the
// rule of one quota per rep comes from the stamps table's unique key.
export const QUOTA_TITLE = `${FISCAL_YEAR} sales growth quota`

// A row for the activities table. Blank supplier and location are stored as
// null, not ''.
export interface ActivityRow {
  type: ActivityType
  title: string
  supplier: string | null
  location: string | null
  event_date: string | null // YYYY-MM-DD, null when isUndated(type)
}

// The same squash the passport's Club Express rule uses (src/lib/rules.ts),
// so "Club Express, Fall" finds the Fall session in both places.
const squash = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, '')

// Which activity a stamp belongs to. Club Express has to be one of the two
// set sessions in src/config.ts, matched by name or day, and is stored under
// that session's own name and day so the two sessions stay two rows. Returns
// the reason as a string when the stamp can't be placed.
export function activityFor(row: StampRow): ActivityRow | string {
  const type = activityTypeOf(row.activity, row.format)
  const blank = (text: string) => (text.trim() === '' ? null : text.trim())
  if (type === 'club_express') {
    const session = CLUB_EXPRESS.find((e) => row.date === e.date || squash(row.event) === squash(e.title))
    if (!session) {
      return `“${row.event}” on ${row.date} isn’t either Club Express session (${CLUB_EXPRESS.map((e) => `${e.title} on ${e.date}`).join(', ')})`
    }
    return { type, title: session.title, supplier: null, location: blank(row.location), event_date: session.date }
  }
  if (type === 'quota') return { type, title: QUOTA_TITLE, supplier: null, location: null, event_date: null }
  return {
    type,
    title: row.event.trim(),
    supplier: blank(row.supplier),
    // A virtual session has no room, and a Hub course is done at a desk.
    location: type === 'virtual_training' || type === 'hub_training' ? null : blank(row.location),
    event_date: isUndated(type) ? null : row.date,
  }
}

// What makes two activity rows the same one, matching the table's
// activities_identity_key: type, title and day.
export const activityKey = (a: Pick<ActivityRow, 'type' | 'title' | 'event_date'>) => `${a.type}|${a.title}|${a.event_date ?? ''}`
