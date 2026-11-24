// The thinking behind scripts/import-attendance.js, kept apart from the
// script so it can be tested without a database: read an attendance CSV
// into clean rows, then compare them with what Supabase already has and say
// exactly what an import would add or change. The script does the reading,
// the printing and (only with --apply) the writing.
//
// An import never deletes and never blanks a field. It adds reps,
// activities and stamps that aren't there yet, and updates a rep's name,
// team or company when the CSV has a different non-blank value.
//
// Imports carry .ts extensions so the Node script can load this directly.

import { EXPIRY_DATE, FISCAL_YEAR, ISSUE_DATE, TEAMS } from '../config.ts'
import { activityFor, activityKey, type ActivityRow, type ActivityType } from '../data/activity-types.ts'
import { parseActivity, parseFormat, tableToRecords, toRepRow, toStampRow } from './sheet.ts'

// One usable CSV row: who, and what they earned a stamp for.
export interface AttendanceRow {
  line: number // the CSV row it came from, header is row 1
  email: string
  name: string
  team: string | null
  company: string | null
  activity: ActivityRow
  earned_at: string // YYYY-MM-DD
}

export interface ReadResult {
  rows: AttendanceRow[]
  skipped: string[] // rows left out, with why
  notes: string[] // kept, but worth a look
}

// Column spellings beyond the ones lib/sheet.ts already knows ("type" and
// "title" read as activity and event there). "Activity title" is what the
// brief's CSV calls the event.
const EXTRA_HEADERS: Record<string, string> = {
  activity_title: 'event',
  activity_name: 'event',
  event_title: 'event',
  activity_type: 'activity',
  stamp_type: 'activity',
  company_name: 'company',
  rep_company: 'company',
}

const text = (value: unknown) => String(value ?? '').trim()

// The same squash the passport uses for Club Express, so "Fall supplier fair"
// and "Fall Supplier Fair" are one event.
const squash = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '')
// Two activities are the same event if type and day match and the titles
// only differ in case, spacing or punctuation.
export const looseKey = (a: Pick<ActivityRow, 'type' | 'title' | 'event_date'>) => `${a.type}|${squash(a.title)}|${a.event_date ?? ''}`

export function readAttendance(grid: readonly (readonly unknown[])[], today: string): ReadResult {
  const skipped: string[] = []
  const notes: string[] = []
  const rows: AttendanceRow[] = []
  const records = tableToRecords(grid).map((raw) => {
    const out: Record<string, unknown> = { ...raw }
    for (const [from, to] of Object.entries(EXTRA_HEADERS)) {
      if (from in out && !text(out[to])) out[to] = out[from]
    }
    return out
  })

  // The first name, team and company seen for each email wins. A later row
  // that disagrees gets a note rather than silently changing it.
  const firstRep = new Map<string, { line: number; name: string; team: string | null; company: string | null }>()
  // One stamp per rep per activity, like the table.
  const seenStamp = new Map<string, number>()
  // The first spelling of an event wins, so a typo'd capital doesn't make two.
  const spelling = new Map<string, ActivityRow>()

  for (const raw of records) {
    const line = raw._row as number
    const at = `Row ${line}`

    const rep = toRepRow(raw)
    if (typeof rep === 'string') {
      skipped.push(`${at}: ${rep}`)
      continue
    }

    // No type column, or a blank one: work it out from the title, the way
    // the sheet does ("Fall Supplier Fair" is a fair). The database's own
    // type names work too: in_person_training reads as an in-person training.
    const typed = text(raw.activity)
    const kind = typed || text(raw.event)
    if (!parseActivity(kind)) {
      skipped.push(
        typed
          ? `${at}: no activity type it knows (“${typed}”)`
          : `${at}: can’t tell what kind of activity “${text(raw.event)}” is, so add a type column (in_person_training, virtual_training, supplier_fair, hub_training, club_express or quota)`,
      )
      continue
    }
    const format = parseFormat(raw.format) || parseFormat(typed)
    const stamp = toStampRow({ ...raw, activity: kind, format })
    if (typeof stamp === 'string') {
      skipped.push(`${at}: ${stamp}`)
      continue
    }
    if (stamp.activity === 'training' && !format) notes.push(`${at}: no format, so it’s stored as a virtual training (it won’t count toward the in-person four)`)

    if (stamp.date > today) {
      skipped.push(`${at}: dated ${stamp.date}, which hasn’t happened yet`)
      continue
    }
    if (stamp.date < ISSUE_DATE || stamp.date > EXPIRY_DATE) {
      skipped.push(`${at}: dated ${stamp.date}, outside ${FISCAL_YEAR} (${ISSUE_DATE} to ${EXPIRY_DATE})`)
      continue
    }

    const placed = activityFor(stamp)
    if (typeof placed === 'string') {
      skipped.push(`${at}: ${placed}`)
      continue
    }
    const activity = spelling.get(looseKey(placed)) ?? placed
    if (!spelling.has(looseKey(placed))) spelling.set(looseKey(placed), placed)

    const team = rep.team || null
    if (team && !(TEAMS as readonly string[]).includes(team)) notes.push(`${at}: team “${team}” isn’t one of ${TEAMS.join(', ')}`)
    const company = text(raw.company) || null
    const first = firstRep.get(rep.rep_email)
    if (!first) firstRep.set(rep.rep_email, { line, name: rep.rep_name, team, company })
    else {
      const differs = [
        first.name !== rep.rep_name && `name “${rep.rep_name}”`,
        team && first.team && first.team !== team && `team “${team}”`,
        company && first.company && first.company !== company && `company “${company}”`,
      ].filter(Boolean)
      if (differs.length) notes.push(`${at}: ${differs.join(', ')} for ${rep.rep_email} differs from row ${first.line}, which is used`)
    }

    const stampKey = `${rep.rep_email}|${looseKey(activity)}`
    const earlier = seenStamp.get(stampKey)
    if (earlier !== undefined) {
      skipped.push(`${at}: ${rep.rep_email} already has “${activity.title}” on row ${earlier}`)
      continue
    }
    seenStamp.set(stampKey, line)

    const who = firstRep.get(rep.rep_email)!
    rows.push({ line, email: rep.rep_email, name: who.name, team: who.team, company: who.company, activity, earned_at: stamp.date })
  }
  return { rows, skipped, notes }
}

// What's in the database now, as much as the plan needs.
export interface CurrentRep {
  id: string
  email: string
  name: string
  team: string | null
  company: string | null
}
export interface CurrentActivity extends ActivityRow {
  id: string
}
export interface CurrentState {
  reps: CurrentRep[]
  activities: CurrentActivity[]
  stamps: { rep_id: string; activity_id: string }[]
}

export interface RepChange {
  id: string
  email: string
  set: Partial<Pick<CurrentRep, 'name' | 'team' | 'company'>>
  was: Partial<Pick<CurrentRep, 'name' | 'team' | 'company'>>
}

export interface NewStamp {
  email: string
  activity: string // activityKey of the activity it belongs to (existing or new)
  type: ActivityType
  title: string
  earned_at: string
  source: 'import' | 'admin'
}

export interface Plan {
  newReps: { email: string; name: string; team: string | null; company: string | null }[]
  changedReps: RepChange[]
  sameReps: number
  newActivities: ActivityRow[]
  sameActivities: number
  // Existing activities by activityKey of the CSV's spelling, so stamps can
  // find their id.
  activityIds: Map<string, string>
  newStamps: NewStamp[]
  sameStamps: number
  notes: string[]
}

export function planImport(rows: AttendanceRow[], current: CurrentState): Plan {
  const notes: string[] = []
  const repByEmail = new Map(current.reps.map((r) => [r.email, r]))
  const activityByLoose = new Map(current.activities.map((a) => [looseKey(a), a]))
  const haveStamp = new Set(current.stamps.map((s) => `${s.rep_id}|${s.activity_id}`))

  // Reps: new ones, and changes to a non-blank field.
  const newReps: Plan['newReps'] = []
  const changedReps: RepChange[] = []
  let sameReps = 0
  const seenRep = new Set<string>()
  for (const row of rows) {
    if (seenRep.has(row.email)) continue
    seenRep.add(row.email)
    const existing = repByEmail.get(row.email)
    if (!existing) {
      newReps.push({ email: row.email, name: row.name, team: row.team, company: row.company })
      continue
    }
    const set: RepChange['set'] = {}
    const was: RepChange['was'] = {}
    if (row.name && row.name !== existing.name) [set.name, was.name] = [row.name, existing.name]
    if (row.team && row.team !== existing.team) [set.team, was.team] = [row.team, existing.team]
    if (row.company && row.company !== existing.company) [set.company, was.company] = [row.company, existing.company]
    if (Object.keys(set).length) changedReps.push({ id: existing.id, email: row.email, set, was })
    else sameReps += 1
  }

  // Activities: an existing one with the same type, day and title (case and
  // punctuation aside) is reused, and keeps its own supplier and city.
  const newActivities = new Map<string, ActivityRow>()
  const activityIds = new Map<string, string>()
  const sameActivityKeys = new Set<string>()
  for (const row of rows) {
    const key = activityKey(row.activity)
    const existing = activityByLoose.get(looseKey(row.activity))
    if (existing) {
      activityIds.set(key, existing.id)
      if (!sameActivityKeys.has(key)) {
        sameActivityKeys.add(key)
        const differs = [
          row.activity.supplier && existing.supplier && row.activity.supplier !== existing.supplier && `supplier “${row.activity.supplier}” (it has “${existing.supplier}”)`,
          row.activity.location && existing.location && row.activity.location !== existing.location && `city “${row.activity.location}” (it has “${existing.location}”)`,
        ].filter(Boolean)
        if (differs.length) notes.push(`Row ${row.line}: “${existing.title}” is already in the database, so its ${differs.join(' and ')} is left as it is`)
      }
    } else if (!newActivities.has(key)) newActivities.set(key, row.activity)
  }

  // Stamps: anything the rep doesn't have yet. A rep or activity that's new
  // can't have a stamp yet, so those are all new.
  const newStamps: NewStamp[] = []
  let sameStamps = 0
  for (const row of rows) {
    const rep = repByEmail.get(row.email)
    const key = activityKey(row.activity)
    const activityId = activityIds.get(key)
    if (rep && activityId && haveStamp.has(`${rep.id}|${activityId}`)) {
      sameStamps += 1
      continue
    }
    newStamps.push({
      email: row.email,
      activity: key,
      type: row.activity.type,
      title: row.activity.title,
      earned_at: row.earned_at,
      source: row.activity.type === 'quota' ? 'admin' : 'import',
    })
  }

  return {
    newReps,
    changedReps,
    sameReps,
    newActivities: [...newActivities.values()],
    sameActivities: sameActivityKeys.size,
    activityIds,
    newStamps,
    sameStamps,
    notes,
  }
}

export const planIsEmpty = (plan: Plan) => !plan.newReps.length && !plan.changedReps.length && !plan.newActivities.length && !plan.newStamps.length
