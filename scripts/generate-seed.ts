// Writes supabase/seed.sql from the demo's sample data, so a new Supabase
// project can start with the same 60 test reps and their stamps. It only
// writes the file: nothing here connects to a database. Run it with
//   npm run seed
// or point it at another file shaped like passport.json:
//   npm run seed -- path/to/data.json
//
// Nothing real goes in the seed, even if the input has it:
//   - A rep whose email isn't @example.com is swapped for a numbered test rep
//     (test.rep.01@example.com, "Test Rep 01"). The sample's reps are already
//     made up and use example.com, so they come through as they are.
//   - Supplier names are real brands, so each one becomes "Supplier A",
//     "Supplier B" and so on, in the order of SUPPLIERS in src/config.ts. Hub
//     course titles that name a real product get a plain title instead.
//   - A last check fails the run if any supplier or product name survived.
//
// The SQL only inserts, and skips anything already there (on conflict do
// nothing), so running it twice is harmless. It never updates or deletes.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CLUB_EXPRESS, DEMO_EVENTS, SUPPLIERS } from '../src/config.ts'
import { activityFor, activityKey, QUOTA_TITLE, type ActivityRow } from '../src/data/activity-types.ts'
import type { RepRow, StampRow } from '../src/data/types.ts'
import { cleanData } from '../src/lib/sheet.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'supabase', 'seed.sql')

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}

const here = process.env.INIT_CWD ?? process.cwd()
const input = process.argv[2] ? resolve(here, process.argv[2]) : join(ROOT, 'public', 'data', 'passport.json')
const body = JSON.parse(readFileSync(input, 'utf8')) as { reps?: unknown; stamps?: unknown }
if (!Array.isArray(body.reps) || !Array.isArray(body.stamps)) fail(`${input} should have a list of reps and a list of stamps.`)
const { data, problems } = cleanData(body.reps as Record<string, unknown>[], body.stamps as Record<string, unknown>[])
if (problems.length) console.warn(`${problems.length} rows skipped or fixed on the way in:\n  ${problems.join('\n  ')}`)

// Fake names ------------------------------------------------------------------

const letter = (i: number) => (i < 26 ? String.fromCharCode(65 + i) : `${String.fromCharCode(65 + Math.floor(i / 26) - 1)}${String.fromCharCode(65 + (i % 26))}`)
const known = [...SUPPLIERS] as string[]
const suppliersSeen = [...new Set(data.stamps.map((s) => s.supplier).filter(Boolean))]
// Suppliers in config keep their place, so the same brand is the same letter
// every time. Anything else in the input gets the letters after them.
const supplierOrder = [...known, ...suppliersSeen.filter((s) => !known.some((k) => k.toLowerCase() === s.toLowerCase()))]
const fakeSupplier = (name: string) => {
  const i = supplierOrder.findIndex((s) => s.toLowerCase() === name.toLowerCase())
  return `Supplier ${letter(i)}`
}

// Hub course titles that name a product. The rest are plain already.
const PLAIN_COURSE: Record<string, string> = {
  'Meraki fundamentals': 'Cloud networking fundamentals',
  'Instant On basics': 'Small business Wi-Fi basics',
  'Toughbook lineup': 'Rugged laptop lineup',
  'Mist wireless overview': 'AI wireless overview',
}
// Names that mustn't appear anywhere in the output, beyond the suppliers.
const PRODUCTS = ['Meraki', 'Instant On', 'Toughbook', 'Mist']

// Training titles carry the supplier's name ("Zebra solutions workshop"), so
// swap it wherever it appears.
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const withoutSuppliers = (text: string) =>
  supplierOrder.reduce((out, name) => out.replace(new RegExp(`\\b${escapeRegExp(name)}\\b`, 'gi'), fakeSupplier(name)), text)

const fakeEvent = (row: StampRow) => withoutSuppliers(PLAIN_COURSE[row.event] ?? row.event)

// Reps whose email isn't example.com become numbered test reps, in the order
// they appear, keeping their team.
let swapped = 0
const repEmail = new Map<string, string>()
const reps: RepRow[] = data.reps.map((rep) => {
  if (rep.rep_email.endsWith('@example.com')) {
    repEmail.set(rep.rep_email, rep.rep_email)
    return rep
  }
  swapped += 1
  const n = String(swapped).padStart(2, '0')
  const email = `test.rep.${n}@example.com`
  repEmail.set(rep.rep_email, email)
  return { ...rep, rep_email: email, rep_name: `Test Rep ${n}` }
})

// Activities and stamps -----------------------------------------------------

const activities = new Map<string, ActivityRow>()
const addActivity = (a: ActivityRow) => {
  const key = activityKey(a)
  if (!activities.has(key)) activities.set(key, a)
  return key
}

interface SeedStamp {
  email: string
  activity: string // activityKey
  earned_at: string
  source: 'import' | 'admin'
}
const stamps: SeedStamp[] = []
const skipped: string[] = []
for (const row of data.stamps) {
  const fake: StampRow = {
    ...row,
    rep_email: repEmail.get(row.rep_email)!,
    event: fakeEvent(row),
    supplier: row.supplier ? fakeSupplier(row.supplier) : '',
  }
  const activity = activityFor(fake)
  if (typeof activity === 'string') {
    skipped.push(`${row.rep_email}: ${activity}`)
    continue
  }
  const key = addActivity(activity)
  // One stamp per rep per activity, like the table. A Hub course finished on
  // two days keeps the first.
  if (stamps.some((s) => s.email === fake.rep_email && s.activity === key)) continue
  stamps.push({ email: fake.rep_email, activity: key, earned_at: row.date, source: activity.type === 'quota' ? 'admin' : 'import' })
}
if (skipped.length) console.warn(`${skipped.length} stamps left out:\n  ${skipped.join('\n  ')}`)

// Both Club Express sessions and the quota belong on the calendar even before
// anyone has a stamp for them.
for (const session of CLUB_EXPRESS) {
  addActivity({ type: 'club_express', title: session.title, supplier: null, location: DEMO_EVENTS.club.location, event_date: session.date })
}
addActivity({ type: 'quota', title: QUOTA_TITLE, supplier: null, location: null, event_date: null })

// SQL ---------------------------------------------------------------------------

const lit = (value: string | null) => (value === null ? 'null' : `'${value.replace(/'/g, "''")}'`)
const dateLit = (value: string | null) => (value === null ? 'null::date' : `date ${lit(value)}`)

const byKey = (a: ActivityRow, b: ActivityRow) =>
  a.type.localeCompare(b.type) || (a.event_date ?? '').localeCompare(b.event_date ?? '') || a.title.localeCompare(b.title)
const activityList = [...activities.values()].sort(byKey)
const stampList = [...stamps].sort((a, b) => a.earned_at.localeCompare(b.earned_at) || a.email.localeCompare(b.email) || a.activity.localeCompare(b.activity))

const repValues = reps.map((r) => `  (${lit(r.rep_email)}, ${lit(r.rep_name)}, ${lit(r.team || null)})`).join(',\n')
const activityValues = activityList
  .map((a) => `  (${lit(a.type)}, ${lit(a.title)}, ${lit(a.supplier)}, ${lit(a.location)}, ${dateLit(a.event_date)})`)
  .join(',\n')
const stampValues = stampList
  .map((s) => {
    const a = activities.get(s.activity)!
    return `  (${lit(s.email)}, ${lit(a.type)}, ${lit(a.title)}, ${dateLit(a.event_date)}, ${dateLit(s.earned_at)}, ${lit(s.source)})`
  })
  .join(',\n')

const sql = `-- Test data for a new Supabase project: the demo's made-up reps and their
-- stamps, with every supplier name swapped for a fake one.
--
-- Generated by scripts/generate-seed.ts from ${relative(ROOT, input) || input}. Don't edit
-- it by hand: change the script or the data and run \`npm run seed\` again.
--
-- It only inserts, and skips anything that's already there, so it's safe to
-- run twice. It never updates or deletes. Run it after the migrations.

begin;

-- ${reps.length} reps. All example.com.
insert into public.reps (email, name, team) values
${repValues}
on conflict (email) do nothing;

-- ${activityList.length} activities.
insert into public.activities (type, title, supplier, location, event_date) values
${activityValues}
on conflict on constraint activities_identity_key do nothing;

-- ${stampList.length} stamps, matched to their rep by email and to their activity by
-- type, title and day.
insert into public.stamps (rep_id, activity_id, earned_at, source)
select r.id, a.id, v.earned_at, v.source
from (values
${stampValues}
) as v (email, type, title, event_date, earned_at, source)
join public.reps r on r.email = v.email
join public.activities a on a.type = v.type and a.title = v.title and a.event_date is not distinct from v.event_date
on conflict (rep_id, activity_id) do nothing;

commit;
`

// Last line of defence: no supplier, product or non-example.com email made it
// through. Team names are the company's own business units, so they're left
// alone, and they sit outside the strings checked here.
const checked = [...reps.flatMap((r) => [r.rep_email, r.rep_name]), ...activityList.flatMap((a) => [a.title, a.supplier ?? '', a.location ?? ''])]
const leaks = [...known, ...suppliersSeen, ...PRODUCTS].filter((name) =>
  checked.some((text) => new RegExp(`\\b${escapeRegExp(name)}\\b`, 'i').test(text)),
)
if (leaks.length) fail(`Stopped: the seed would still name ${[...new Set(leaks)].join(', ')}. Nothing was written.`)
const badEmail = reps.find((r) => !r.rep_email.endsWith('@example.com'))
if (badEmail) fail(`Stopped: ${badEmail.rep_email} isn't an example.com address. Nothing was written.`)

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, sql)
console.log(
  `Wrote ${reps.length} reps${swapped ? ` (${swapped} swapped for test reps)` : ''}, ${activityList.length} activities and ${stampList.length} stamps to ${relative(ROOT, OUT)}`,
)
