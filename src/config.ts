// Every rule and knob for the passport lives here, so changing a minimum or
// the demo date is a one-line edit. The data script imports this file too.

// The five things a rep does to qualify for President's Club. The order here
// is the order they show up everywhere: the pages, the checklist, the board.
export const ACTIVITIES = ['training', 'fair', 'hub', 'club', 'quota'] as const
export type Activity = (typeof ACTIVITIES)[number]

// What each one is called on the page.
export const ACTIVITY_NAMES: Record<Activity, string> = {
  training: 'Supplier trainings',
  fair: 'Supplier fairs',
  hub: 'Hub training',
  club: 'Club Express',
  quota: 'Sales growth quota',
}

// The minimum for each, straight from the director's brief. Trainings count
// in-person sessions only; virtual ones still earn a stamp.
export const MINIMUMS: Record<Activity, number> = {
  training: 4,
  fair: 2,
  hub: 2,
  club: 2,
  quota: 1,
}

// Stamp slots on each activity's page. Anything past these goes in the
// page's extras list ("Also attended", or "Also finished" for Hub). Quota has
// its own seal page instead.
export const SLOTS = { training: 4, fair: 2, hub: 2, club: 2 } as const
export type SlotActivity = keyof typeof SLOTS

// Club Express is two set events and a rep has to make both, so the passport
// needs to know when they are: miss one that's passed and it's out of reach.
export const CLUB_EXPRESS = [
  { title: 'Club Express Fall', date: '2026-10-14' },
  { title: 'Club Express Spring', date: '2027-06-17' },
] as const

// The program runs on the fiscal year, July to June. Quota results are known
// once the year closes.
export const PROGRAM_YEAR = 2027
export const FISCAL_YEAR = 'FY27'
export const ISSUE_DATE = '2026-07-01'
export const EXPIRY_DATE = '2027-06-30'
export const QUOTA_DATE = EXPIRY_DATE

// The demo pretends today is this date: Club Express Spring in Greenville,
// with a supplier fair and an in-person training the same day.
export const DEMO_TODAY = '2027-06-17'

// The live passport (signed in, reading Supabase) uses the real date in this
// time zone, where the program is run from. rep_progress in Supabase uses
// the same zone, so the two agree on what "today" is.
export const PROGRAM_TIME_ZONE = 'America/New_York'

// Teams are business units, each selling its own set of suppliers.
export const TEAMS = ['Communications', 'POSB', 'NetSec', 'Cisco', 'Federal'] as const

// Suppliers running trainings and Hub courses. Keep them in this one array,
// and add new ones at the end: a supplier's place in it picks its stamp.
export const SUPPLIERS = [
  'Zebra',
  'Honeywell',
  'HP Poly',
  'HPE Aruba',
  'Juniper',
  'Extreme Networks',
  'Cambium',
  'Datalogic',
  'ASSA ABLOY',
  'Panasonic',
  'Brady',
  'Pioneer',
  'Cisco',
] as const

// Standings draws a short board once a view has more than `fullUpTo` reps:
// the top `top`, `aroundLine` reps either side of the President's Club line
// and `aroundYou` either side of you. The rest fold into gap rows that open
// `step` at a time. A gap smaller than `minGap` just gets drawn, since its
// row would take as much room as the rep it hides.
export const BOARD = { fullUpTo: 25, top: 10, aroundLine: 2, aroundYou: 3, step: 50, minGap: 2 } as const

// The demo opens as this rep when they're in the data. Otherwise it picks
// whoever is furthest from qualifying who could still get there today.
export const DEMO_REP = 'hannah-kowalski'

// What the demo's Record buttons stamp, all dated DEMO_TODAY. The Hub course
// is picked per rep (the first one in HUB_COURSES they haven't done).
export const DEMO_EVENTS = {
  training: { event: 'Pioneer solutions workshop', supplier: 'Pioneer', format: 'in person', location: 'Greenville' },
  fair: { event: 'Summer Supplier Fair', supplier: '', format: 'in person', location: 'Greenville' },
  club: { event: 'Club Express Spring', supplier: '', format: 'in person', location: 'Greenville' },
  quota: { event: `${FISCAL_YEAR} sales growth quota`, supplier: '', format: '', location: '' },
} as const

// The supplier-hosted courses on the Hub. The sample data and the demo pick
// from these.
export const HUB_COURSES = [
  { supplier: 'Zebra', event: 'Mobile computing essentials' },
  { supplier: 'Cisco', event: 'Meraki fundamentals' },
  { supplier: 'HPE Aruba', event: 'Instant On basics' },
  { supplier: 'Honeywell', event: 'Scanning portfolio tour' },
  { supplier: 'HP Poly', event: 'Video room design' },
  { supplier: 'Extreme Networks', event: 'Fabric networking 101' },
  { supplier: 'Panasonic', event: 'Toughbook lineup' },
  { supplier: 'Juniper', event: 'Mist wireless overview' },
] as const

// When the demo records a group event (a training, a fair, Club Express),
// roughly this share of everyone else who doesn't have it yet gets stamped too.
export const DEMO_SHARE = 0.65

// Seeds for anything random. Same seed, same sample data, every time.
export const DATA_SEED = 2027
// DEMO_SEED picks who else shows up to today's events. With 96, Jordan,
// Marcus and Priya make all three, and recording Club Express Spring takes
// "Activities done" from 0 to 18 of 60.
export const DEMO_SEED = 96

// Key for demo changes in localStorage. A saved recording keeps the emails of
// who got stamped, so bump this when DEMO_SEED or the data changes.
export const STORAGE_KEY = 'pcp-demo-v1'
