// The shape of the data, matching the two tabs of the tracking sheet: one row
// per rep, and one row per stamp a rep has earned. Column names are the keys.
// lib/sheet.ts turns a tab (or a CSV export of one) into these.

import type { Activity } from '../config.ts'

export type TrainingFormat = 'virtual' | 'in person'

// The Reps tab.
export interface RepRow {
  rep_email: string
  rep_name: string
  team: string
  start_date: string // YYYY-MM-DD, or '' when they were here all year
}

// The Stamps tab. Only things a rep actually did go in here: nothing upcoming,
// nothing missed.
export interface StampRow {
  rep_email: string
  activity: Activity
  event: string // "Zebra partner training", "Fall Supplier Fair", a Hub course's title
  supplier: string // trainings and Hub courses; '' for the rest
  date: string // YYYY-MM-DD, the day they attended or finished it
  format: TrainingFormat | '' // trainings; fairs and Club Express are in person
  location: string // city, when there is one
}

export interface PassportData {
  reps: RepRow[]
  stamps: StampRow[]
}
