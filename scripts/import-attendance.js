// Imports an attendance CSV into Supabase: adds the reps, activities and
// stamps it has that the database doesn't yet.
//
//   npm run import:attendance -- attendance.csv            (dry run: shows what it would do)
//   npm run import:attendance -- attendance.csv --apply    (does it)
//
// A dry run is the default and writes nothing. It still reads the database
// so it can say exactly what's new. Only --apply writes, and even then it
// never deletes anything or blanks a field: it adds what's missing and
// updates a rep's name, team or company when the CSV has a different value.
// Running the same file twice adds nothing the second time.
//
// It needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in a .env file at the
// repo root (copy .env.example). The service role key can do anything in the
// project, so it stays in .env, which is gitignored. Never put it in
// public/config.js, front-end code or a commit.
//
// Columns (header spellings are forgiving, see src/lib/sheet.ts):
//   email, name, date          required
//   type                       in_person_training, virtual_training, supplier_fair,
//                              hub_training, club_express or quota. Left out, it's
//                              worked out from the title where it can be.
//   title                      the event or course ("Activity title" works too).
//                              Not needed for a quota row.
//   team, company, supplier, format, location    optional
//
// Real attendance has real names and emails in it, and *.csv is gitignored,
// so keep the file outside the repo or let the ignore rule cover it.

import { readFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { ACTIVITY_TYPES } from '../src/data/activity-types.ts'
import { planImport, planIsEmpty, readAttendance } from '../src/lib/attendance.ts'
import { guessSeparator, parseCsv } from '../src/lib/csv.ts'
import { todayInProgram } from '../src/lib/today.ts'
import { PROGRAM_TIME_ZONE } from '../src/config.ts'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const USAGE = 'Usage: npm run import:attendance -- <attendance.csv> [--apply]'
const CHUNK = 200 // rows per request, well under PostgREST's limits

function fail(message) {
  console.error(`\n${message}\n`)
  process.exit(1)
}

// Arguments -------------------------------------------------------------------

const args = process.argv.slice(2)
if (args.includes('--help') || args.includes('-h')) {
  console.log(USAGE)
  process.exit(0)
}
const apply = args.includes('--apply')
const unknown = args.filter((a) => a.startsWith('-') && !['--apply', '--dry-run'].includes(a))
if (unknown.length) fail(`Don’t know ${unknown.join(', ')}.\n${USAGE}`)
if (apply && args.includes('--dry-run')) fail('Pick one: --dry-run or --apply.')
const files = args.filter((a) => !a.startsWith('-'))
if (files.length !== 1) fail(USAGE)
// npm runs scripts from the repo folder, so read the path from where the
// command was typed.
const csvPath = resolve(process.env.INIT_CWD ?? process.cwd(), files[0])

// The CSV ---------------------------------------------------------------------------

function readText(path) {
  let bytes
  try {
    bytes = readFileSync(path)
  } catch {
    return fail(`Couldn’t read ${path}.`)
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    console.warn(`${basename(path)} isn’t UTF-8, so it was read as Excel’s older Windows CSV. Check accented names.`)
    return new TextDecoder('windows-1252').decode(bytes)
  }
}

const today = todayInProgram()
const csvText = readText(csvPath)
const grid = parseCsv(csvText, guessSeparator(csvText))
const read = readAttendance(grid, today)

// Supabase ------------------------------------------------------------------------

try {
  process.loadEnvFile(join(ROOT, '.env'))
} catch {
  // No .env. That's fine for checking a CSV; --apply needs one.
}
const url = process.env.SUPABASE_URL?.trim()
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

// Refuse a key that can't be the service role, so a mix-up fails loudly
// instead of reading nothing through row-level security.
function checkKey(value) {
  if (value.startsWith('sb_publishable_')) return 'That’s the publishable (anon) key. The importer needs the secret service role key.'
  if (value.startsWith('sb_secret_')) return null
  const [, payload] = value.split('.')
  if (!payload) return 'SUPABASE_SERVICE_ROLE_KEY doesn’t look like a Supabase key.'
  try {
    const role = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')).role
    if (role !== 'service_role') return `That key is for the “${role}” role. The importer needs the service role key.`
  } catch {
    return 'SUPABASE_SERVICE_ROLE_KEY doesn’t look like a Supabase key.'
  }
  return null
}

let db = null
if (url && key) {
  const problem = checkKey(key)
  if (problem) fail(problem)
  db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
} else if (apply) {
  fail('--apply needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env at the repo root (see .env.example). Nothing was written.')
}

const chunks = (items, size = CHUNK) => Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size))

async function must(promise, what) {
  const { data, error } = await promise
  if (error) throw new Error(`${what}: ${error.message}`)
  return data
}

// Every row of a query, a page at a time (Supabase returns 1000 at most).
async function all(build, what) {
  const rows = []
  for (let from = 0; ; from += 1000) {
    const page = await must(build().range(from, from + 999), what)
    rows.push(...page)
    if (page.length < 1000) return rows
  }
}

async function currentState(emails) {
  const reps = []
  for (const part of chunks(emails)) {
    reps.push(...(await all(() => db.from('reps').select('id, email, name, team, company').in('email', part).order('email'), 'Reading reps')))
  }
  const activities = await all(() => db.from('activities').select('id, type, title, supplier, location, event_date').order('id'), 'Reading activities')
  const stamps = []
  for (const part of chunks(reps.map((r) => r.id))) {
    stamps.push(...(await all(() => db.from('stamps').select('rep_id, activity_id').in('rep_id', part).order('id'), 'Reading stamps')))
  }
  return { reps, activities, stamps }
}

// Printing ------------------------------------------------------------------------

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
const show = (label, lines, limit = 25) => {
  if (!lines.length) return
  console.log(`\n${label}`)
  for (const line of lines.slice(0, limit)) console.log(`  ${line}`)
  if (lines.length > limit) console.log(`  …and ${lines.length - limit} more`)
}
const describeActivity = (a) => [a.type.padEnd(18), a.title, a.event_date ?? '', a.supplier ?? '', a.location ?? ''].filter(Boolean).join('  ')
const describeChange = (c) =>
  `${c.email}  ${Object.keys(c.set)
    .map((field) => `${field}: ${c.was[field] ?? '(blank)'} → ${c.set[field]}`)
    .join(', ')}`

console.log(`\nAttendance import: ${basename(csvPath)}, ${plural(Math.max(grid.length - 1, 0), 'row')}`)
console.log(db ? `Project: ${new URL(url).host}` : 'Project: none (no .env), so this only checks the CSV')
console.log(apply ? 'APPLYING: changes below will be written.' : 'DRY RUN: nothing will be written. Run again with --apply to make these changes.')
console.log(`Today (${PROGRAM_TIME_ZONE}): ${today}. Rows dated after today are left out.`)

show(`Left out (${read.skipped.length}):`, read.skipped)
show(`Worth a look (${read.notes.length}):`, read.notes)

if (!read.rows.length) fail('No usable rows, so there’s nothing to import.')

if (!db) {
  const types = ACTIVITY_TYPES.map((t) => `${t} ${read.rows.filter((r) => r.activity.type === t).length}`).join(', ')
  console.log(`\n${plural(read.rows.length, 'usable row')}: ${types}`)
  console.log('\nAdd SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to .env to see what’s new compared with the database.\n')
  process.exit(0)
}

let current
try {
  current = await currentState([...new Set(read.rows.map((r) => r.email))])
} catch (error) {
  fail(`${error.message}. Nothing was written.`)
}
const plan = planImport(read.rows, current)

console.log(`\nReps: ${plan.newReps.length} new, ${plan.changedReps.length} updated, ${plan.sameReps} already up to date`)
console.log(`Activities: ${plan.newActivities.length} new, ${plan.sameActivities} already there`)
console.log(`Stamps: ${plan.newStamps.length} new, ${plan.sameStamps} already there`)
show('New reps:', plan.newReps.map((r) => `+ ${r.email}  ${r.name}${r.team ? `  (${r.team})` : ''}`))
show('Rep changes:', plan.changedReps.map((c) => `~ ${describeChange(c)}`))
show('New activities:', plan.newActivities.map((a) => `+ ${describeActivity(a)}`))
show(
  'New stamps by type:',
  ACTIVITY_TYPES.map((t) => [t, plan.newStamps.filter((s) => s.type === t).length]).filter(([, n]) => n).map(([t, n]) => `${String(t).padEnd(18)}  ${n}`),
)
show('Also:', plan.notes)

if (planIsEmpty(plan)) {
  console.log('\nEverything in this file is already in the database. Nothing to do.\n')
  process.exit(0)
}
if (!apply) {
  console.log('\nDry run only. Nothing was written. Check the above, then run again with --apply.\n')
  process.exit(0)
}

// Writing (only with --apply) ---------------------------------------------------------
// Order matters: reps and activities first, so the stamps can point at them.
// Nothing here deletes. If something fails part way, run it again: whatever
// already made it in is skipped.

const done = { reps: 0, updated: 0, activities: 0, stamps: 0 }
try {
  const repIds = new Map(current.reps.map((r) => [r.email, r.id]))
  for (const part of chunks(plan.newReps)) {
    const rows = await must(db.from('reps').insert(part).select('id, email'), 'Adding reps')
    for (const r of rows) repIds.set(r.email, r.id)
    done.reps += rows.length
  }
  for (const change of plan.changedReps) {
    await must(db.from('reps').update(change.set).eq('id', change.id).select('id'), `Updating ${change.email}`)
    done.updated += 1
  }

  const activityIds = new Map(plan.activityIds)
  const keyOf = (a) => `${a.type}|${a.title}|${a.event_date ?? ''}`
  for (const part of chunks(plan.newActivities)) {
    const rows = await must(db.from('activities').insert(part).select('id, type, title, event_date'), 'Adding activities')
    for (const a of rows) activityIds.set(keyOf(a), a.id)
    done.activities += rows.length
  }

  const stamps = plan.newStamps.map((s) => {
    const rep_id = repIds.get(s.email)
    const activity_id = activityIds.get(s.activity)
    if (!rep_id || !activity_id) throw new Error(`Lost track of ${s.email} / ${s.title}`)
    return { rep_id, activity_id, earned_at: s.earned_at, source: s.source }
  })
  for (const part of chunks(stamps)) {
    // ignoreDuplicates: a stamp that turned up since the dry run is skipped,
    // not overwritten.
    const rows = await must(
      db.from('stamps').upsert(part, { onConflict: 'rep_id,activity_id', ignoreDuplicates: true }).select('id'),
      'Adding stamps',
    )
    done.stamps += rows.length
  }
} catch (error) {
  console.error(`\nStopped: ${error.message}`)
  console.error(`Written before it stopped: ${done.reps} reps added, ${done.updated} updated, ${done.activities} activities, ${done.stamps} stamps.`)
  console.error('Nothing was deleted. Fix the problem and run it again: anything already in is skipped.\n')
  process.exit(1)
}

console.log(`\nDone: ${done.reps} reps added, ${done.updated} updated, ${done.activities} activities added, ${done.stamps} stamps added. Nothing was deleted.\n`)
