// The real date in the program's time zone, as YYYY-MM-DD. The demo never
// calls this: it keeps DEMO_TODAY so its story holds. The live passport and
// the attendance importer do.

import { PROGRAM_TIME_ZONE } from '../config.ts'

export function todayInProgram(now: Date = new Date()): string {
  // en-CA formats a date as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: PROGRAM_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}
