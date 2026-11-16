// Turns a CSV export of the tracking sheet into public/data/local.json, so the
// real thing can be checked on the dev server (?data=local before the #).
// Save the Reps and Stamps tabs as CSV UTF-8, then run
//   npm run import -- Reps.csv Stamps.csv
// or point it at one folder holding both. local.json is gitignored: it has
// real names in it and this repo is public.

import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ACTIVITIES, ACTIVITY_NAMES, EXPIRY_DATE, FISCAL_YEAR, ISSUE_DATE, TEAMS } from '../src/config.ts'
import type { RepRow, StampRow } from '../src/data/types.ts'
import { guessSeparator, parseCsv } from '../src/lib/csv.ts'
import { cleanData, tableToRecords, toRepRow, toStampRow } from '../src/lib/sheet.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'public', 'data', 'local.json')
const USAGE = 'Usage: npm run import -- <Reps.csv> <Stamps.csv>\n   or: npm run import -- <folder holding Reps.csv and Stamps.csv>'

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}

// 'folder', 'file', or null when there's nothing there.
const kindOf = (path: string) => {
  try {
    return statSync(path).isDirectory() ? 'folder' : 'file'
  } catch {
    return null
  }
}

// One folder: find the file for each tab by a whole word in its name, so
// "Reps.csv", "reps.csv" and "Tracker - Reps.csv" all work.
function findTab(folder: string, tab: 'reps' | 'stamps'): string {
  const csvs = readdirSync(folder).filter((name) => name.toLowerCase().endsWith('.csv'))
  const matches = csvs.filter((name) => name.toLowerCase().slice(0, -4).split(/[^a-z]+/).includes(tab))
  if (matches.length === 1) return join(folder, matches[0])
  const found = csvs.length ? `It has ${csvs.join(', ')}.` : 'It has no CSV files.'
  if (!matches.length) fail(`Couldn’t find a ${tab} CSV in ${folder}. ${found}\n${USAGE}`)
  return fail(`More than one CSV in ${folder} looks like ${tab}: ${matches.join(', ')}. Name the two files instead.\n${USAGE}`)
}

function pickFiles(): [string, string] {
  // npm runs scripts from the repo folder, so read paths from where the
  // command was typed.
  const here = process.env.INIT_CWD ?? process.cwd()
  const args = process.argv.slice(2).map((arg) => resolve(here, arg))
  for (const path of args) if (!kindOf(path)) fail(`There’s nothing at ${path}.`)
  if (args.length === 2) return [args[0], args[1]]
  if (args.length !== 1) return fail(USAGE)
  if (kindOf(args[0]) === 'folder') return [findTab(args[0], 'reps'), findTab(args[0], 'stamps')]
  return fail(`Name the Stamps file too, or give it the folder holding both.\n${USAGE}`)
}

const notes: string[] = []

// Excel's "CSV UTF-8" is what we want. Its plain "CSV" on Windows writes
// Windows-1252, which isn't valid UTF-8 once there's an accent in it.
function readText(path: string): string {
  let bytes: Buffer
  try {
    bytes = readFileSync(path)
  } catch {
    return fail(`Couldn’t read ${path}.`)
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    notes.push(`${basename(path)} isn’t UTF-8, so it was read as Excel’s older Windows CSV. Check accented names, or save it as CSV UTF-8 instead.`)
    return new TextDecoder('windows-1252').decode(bytes)
  }
}

interface Tab {
  file: string
  columns: string[] // header names after lib/sheet's clean-up, so "Rep Email" is rep_email
  records: Record<string, unknown>[]
  sheetRow: number[] // records[i] came from this row of the sheet (the header is row 1)
}

function readTab(path: string): Tab {
  const text = readText(path)
  const grid = parseCsv(text, guessSeparator(text))
  // tableToRecords skips blank rows and keeps each record's sheet row in
  // _row, so problems name the row it's really on.
  const records = tableToRecords(grid)
  // It also knows the header spellings, so ask it for the column names with
  // a throwaway row.
  const header = grid[0] ?? []
  const columns = Object.keys(tableToRecords([header, header.map(() => '-')])[0] ?? {}).filter((key) => key !== '_row')
  return { file: basename(path), columns, records, sheetRow: records.map((r) => r._row as number) }
}

function needColumns(tab: Tab, name: string, required: string[], optional: string[]) {
  const missing = required.filter((column) => !tab.columns.includes(column))
  if (missing.length) {
    const has = tab.columns.filter(Boolean).join(', ') || 'none'
    const list = missing.length > 1 ? `${missing.slice(0, -1).join(', ')} or ${missing.at(-1)}` : missing[0]
    fail(`${tab.file} should be the ${name} tab, but it has no ${list} column. Its columns: ${has}.`)
  }
  for (const column of optional.filter((column) => !tab.columns.includes(column))) {
    notes.push(`${tab.file} has no ${column} column, so it’s blank for every row.`)
  }
}

const [repsPath, stampsPath] = pickFiles()
const reps = readTab(repsPath)
const stamps = readTab(stampsPath)

if (reps.columns.includes('activity') && !stamps.columns.includes('activity')) {
  fail(`${reps.file} looks like the Stamps tab. Put the Reps file first, then Stamps.\n${USAGE}`)
}
needColumns(reps, 'Reps', ['rep_email', 'rep_name', 'team'], ['start_date'])
needColumns(stamps, 'Stamps', ['rep_email', 'activity', 'event', 'date'], ['supplier', 'format', 'location'])

const { data, problems } = cleanData(reps.records, stamps.records)

const found = [...problems]

// Two things cleanData lets through that would still look wrong in the app:
// a team the app doesn't know, and a stamp from outside the program year.
reps.records.forEach((raw, i) => {
  const row = toRepRow(raw)
  if (typeof row === 'string' || (TEAMS as readonly string[]).includes(row.team)) return
  const why = row.team ? `team “${row.team}” isn’t one of ${TEAMS.join(', ')}` : 'no team'
  found.push(`Reps row ${reps.sheetRow[i]}: ${why}, so they won’t show under a team`)
})
stamps.records.forEach((raw, i) => {
  const row = toStampRow(raw)
  if (typeof row === 'string' || (row.date >= ISSUE_DATE && row.date <= EXPIRY_DATE)) return
  found.push(`Stamps row ${stamps.sheetRow[i]}: dated ${row.date}, outside ${FISCAL_YEAR} (${ISSUE_DATE} to ${EXPIRY_DATE})`)
})

// Reps first, then Stamps, each in row order.
const place = (message: string) => {
  const match = /^(Reps|Stamps) row (\d+)/.exec(message)
  return match ? (match[1] === 'Reps' ? 0 : 1e9) + Number(match[2]) : -1
}
found.sort((a, b) => place(a) - place(b))

// With no reps every stamp fails too, so only the Reps rows are worth showing.
if (!data.reps.length) {
  const why = found.filter((line) => line.startsWith('Reps '))
  fail(`No reps made it through from ${reps.file}, so nothing was written.${why.length ? `\n${why.join('\n')}` : ' It has no rows under the header.'}`)
}

// The summary.
const count = <T>(rows: T[], test: (row: T) => boolean) => rows.filter(test).length
const pad = (text: string | number, width: number) => String(text).padStart(width)
const teams = TEAMS.map((team) => `${team} ${count(data.reps, (rep) => rep.team === team)}`).join(', ')
const width = Math.max(...ACTIVITIES.map((activity) => ACTIVITY_NAMES[activity].length))

console.log(`\nRead ${reps.records.length} rep rows from ${reps.file} and ${stamps.records.length} stamp rows from ${stamps.file}.\n`)
console.log(`Reps kept     ${data.reps.length} (${teams})`)
console.log(`Stamps kept   ${data.stamps.length}`)
for (const activity of ACTIVITIES) {
  const mine = data.stamps.filter((stamp) => stamp.activity === activity)
  const extra = activity === 'training' ? `  (${count(mine, (stamp) => stamp.format === 'in person')} in person)` : ''
  console.log(`  ${ACTIVITY_NAMES[activity].padEnd(width)}  ${pad(mine.length, 4)}${extra}`)
}
for (const note of notes) console.log(`\n${note}`)
if (found.length) console.log(`\n${found.length} ${found.length === 1 ? 'thing' : 'things'} to look at, by row:\n${found.map((line) => `  ${line}`).join('\n')}`)
else console.log('\nNo problems found.')

// Same order and layout as passport.json, so the two diff cleanly.
const repsOut: RepRow[] = [...data.reps].sort((a, b) => a.rep_name.localeCompare(b.rep_name))
const stampsOut: StampRow[] = [...data.stamps].sort(
  (a, b) => a.date.localeCompare(b.date) || a.rep_email.localeCompare(b.rep_email) || a.event.localeCompare(b.event),
)
const lines = (rows: object[]) => rows.map((row) => '    ' + JSON.stringify(row)).join(',\n')
mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, `{\n  "reps": [\n${lines(repsOut)}\n  ],\n  "stamps": [\n${lines(stampsOut)}\n  ]\n}\n`)

console.log(`\nWrote ${relative(ROOT, OUT)}. It’s gitignored, and only the dev server reads it:`)
console.log('  npm run dev, then open http://localhost:5174/supplier-training-passport/?data=local#/standings\n')
