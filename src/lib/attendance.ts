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

import { EXPIRY_DATE, FISCAL_YEAR, ISSUE_DATE, TEAMS, type Activity } from '../config.ts'
import { activityFor, activityKey, type ActivityRow, type ActivityType } from '../data/activity-types.ts'
import type { TrainingFormat } from '../data/types.ts'
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
  // Rows whose type was worked out from the title, and trainings stored as
  // virtual because nothing said in person. Both get a note each; the
  // script also puts the counts up front, since neither can be undone by
  // importing again.
  inferred: number
  virtualByDefault: number
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

// The table's own email rule (something either side of one @), plus no
// spaces, so a row the database would refuse is left out here instead of
// stopping --apply part way.
const EMAIL = /^[^\s@]+@[^\s@]+$/

// With no type column, the title is the only clue, so only clear words count,
// as whole words: "Fairfield partner training" isn't a fair and "GitHub
// basics" isn't a Hub course. The quota is never guessed: it's set by an
// admin, so a quota row has to say quota in the type column.
const TITLE_WORDS: [Exclude<Activity, 'quota'>, RegExp][] = [
  ['club', /\bclub express\b/i],
  ['hub', /\bhub\b/i],
  ['fair', /\bfair\b/i],
  ['training', /\b(training|workshop|session)\b/i],
]
const typeFromTitle = (title: string) => TITLE_WORDS.find(([, words]) => words.test(title))?.[0] ?? null

// The database's two training types already say in person or virtual.
function formatFromType(typed: string): TrainingFormat | '' {
  const key = typed.toLowerCase().replace(/[^a-z]+/g, '_')
  if (key === 'in_person_training') return 'in person'
  if (key === 'virtual_training') return 'virtual'
  return parseActivity(typed) === 'training' ? parseFormat(typed) : ''
}

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
  let inferred = 0
  let virtualByDefault = 0
  const records = tableToRecords(grid).map((raw) => {
    const out: Record<string, unknown> = { ...raw }
    for (const [from, to] of Object.entries(EXTRA_HEADERS)) {
      if (from in out && !text(out[to])) out[to] = out[from]
    }
    return out
  })

  // For each email, the first name wins, and the first team and company that
  // aren't blank. A later row that disagrees gets a note rather than silently
  // changing it.
  const firstRep = new Map<string, { line: number; name: string; team: string | null; company: string | null }>()
  // One stamp per rep per activity, like the table.
  const seenStamp = new Map<string, number>()
  // The first spelling of an event wins, so a typo'd capital doesn't make two.
  const spelling = new Map<string, { activity: ActivityRow; line: number }>()

  for (const raw of records) {
    const line = raw._row as number
    const at = `Row ${line}`

    const rep = toRepRow(raw)
    if (typeof rep === 'string') {
      skipped.push(`${at}: ${rep}`)
      continue
    }
    if (!EMAIL.test(rep.rep_email)) {
      skipped.push(`${at}: “${rep.rep_email}” isn’t an email address it can use`)
      continue
    }

    // The type column decides when there is one. The database's own type
    // names work, and so do the sheet's words ("Supplier Fair", "Quota").
    // Without it, the title is read for clear words only (see TITLE_WORDS).
    const typed = text(raw.activity)
    const title = text(raw.event)
    const kind = typed ? parseActivity(typed) : typeFromTitle(title)
    if (!kind) {
      skipped.push(
        typed
          ? `${at}: no activity type it knows (“${typed}”)`
          : `${at}: can’t tell what kind of activity “${title}” is from its title, so add a type column (in_person_training, virtual_training, supplier_fair, hub_training, club_express or quota)`,
      )
      continue
    }
    if (!typed) {
      inferred += 1
      notes.push(`${at}: no type, so “${title}” is read as ${kind === 'club' ? 'Club Express' : kind === 'hub' ? 'a Hub course' : kind === 'fair' ? 'a supplier fair' : 'a supplier training'} from its title`)
    }

    // A training's format: the type column says it when it's
    // in_person_training or virtual_training, otherwise the format column
    // does. If the two disagree, the row is left out rather than guessed.
    const fromType = typed ? formatFromType(typed) : ''
    const fromColumn = parseFormat(raw.format)
    if (kind === 'training' && fromType && fromColumn && fromType !== fromColumn) {
      skipped.push(`${at}: the type says ${fromType} but the format says ${fromColumn}, so it’s left out. Fix one of them.`)
      continue
    }
    const format = kind === 'training' ? fromType || fromColumn : ''
    const stamp = toStampRow({ ...raw, activity: kind, format })
    if (typeof stamp === 'string') {
      skipped.push(`${at}: ${stamp}`)
      continue
    }
    if (stamp.activity === 'training' && !format) {
      virtualByDefault += 1
      notes.push(`${at}: no format, so it’s stored as a virtual training and won’t count toward the in-person four`)
    }

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
    // An event is stored once, under its first spelling. Two sessions with
    // the same title and day from different suppliers can't both be kept,
    // so say so, the way the sheet import does.
    const firstSpelling = spelling.get(looseKey(placed))
    const activity = firstSpelling?.activity ?? placed
    let otherSession = ''
    if (!firstSpelling) spelling.set(looseKey(placed), { activity: placed, line })
    else {
      const supplierDiffers = placed.supplier && activity.supplier && placed.supplier.toLowerCase() !== activity.supplier.toLowerCase()
      const cityDiffers = placed.location && activity.location && placed.location.toLowerCase() !== activity.location.toLowerCase()
      if (supplierDiffers) otherSession = `same event and day as row ${firstSpelling.line} but ${placed.supplier}, not ${activity.supplier}`
      if (supplierDiffers || cityDiffers) {
        notes.push(
          `${at}: ${supplierDiffers ? otherSession : `same event and day as row ${firstSpelling.line} but in ${placed.location}, not ${activity.location}`}, so it’s stored as row ${firstSpelling.line}’s event. Give each session its own title to keep both`,
        )
      }
    }

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
      // A team or company that was blank on the first row is taken from the
      // first row that has one.
      if (!first.team && team) first.team = team
      if (!first.company && company) first.company = company
    }

    const stampKey = `${rep.rep_email}|${looseKey(activity)}`
    const earlier = seenStamp.get(stampKey)
    if (earlier !== undefined) {
      skipped.push(
        otherSession
          ? `${at}: ${otherSession}, and ${rep.rep_email} already has it from row ${earlier}, so it’s left out. Give each session its own title to keep both`
          : `${at}: ${rep.rep_email} already has “${activity.title}” on row ${earlier}`,
      )
      continue
    }
    seenStamp.set(stampKey, line)
    rows.push({ line, email: rep.rep_email, name: rep.rep_name, team, company, activity, earned_at: stamp.date })
  }
  // Every row for a rep carries the same name, team and company: the ones
  // settled above.
  for (const row of rows) {
    const who = firstRep.get(row.email)!
    Object.assign(row, { name: who.name, team: who.team, company: who.company })
  }
  return { rows, skipped, notes, inferred, virtualByDefault }
}

// What's in the database now, as much as the plan needs.
export interface CurrentRep {
  id: string
  email: string
  name: string
  team: string | null
  company: string | null
  user_id?: string | null
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
  // Reps who'll need a sign-in account made for them (new reps, and reps
  // not linked to one yet), so they can sign in with a link or code.
  accounts: string[]
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

  const accounts = [...new Set(rows.map((r) => r.email))].filter((email) => {
    const existing = repByEmail.get(email)
    return !existing || !existing.user_id
  })

  return {
    newReps,
    changedReps,
    sameReps,
    accounts,
    newActivities: [...newActivities.values()],
    sameActivities: sameActivityKeys.size,
    activityIds,
    newStamps,
    sameStamps,
    notes,
  }
}

export const planIsEmpty = (plan: Plan) =>
  !plan.newReps.length && !plan.changedReps.length && !plan.newActivities.length && !plan.newStamps.length && !plan.accounts.length
