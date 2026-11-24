// The live passport's side of Supabase: signing in with an email link or
// code, and reading the signed-in rep's own row and stamps. Row-level
// security in the database makes sure that's all it can read. Nothing here
// writes to the database.
//
// What it reads is turned into the same PassportData the demo's JSON file
// gives, so everything downstream (the rules, the book, the pages) works
// the same either way.

import type { AuthChangeEvent, Session, SupabaseClient } from '@supabase/supabase-js'
import { runtime } from '../runtime'
import { stampFrom } from '../lib/model'
import { activityOf, isActivityType } from './activity-types'
import { DataError } from './source'
import type { PassportData, StampRow } from './types'

let client: Promise<SupabaseClient> | null = null

// Where supabase-js keeps the session in this browser. Named here, rather
// than left to its default, so the sign-in code can tell whether someone was
// already signed in before an email link was opened.
export const STORAGE_KEY = 'pcp-supabase-auth'

// The user id of the session already stored in this browser, if any. Read
// before Supabase starts up and swaps a ?code= for a new session.
export function storedUserId(): string | null {
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null') as { user?: { id?: unknown } } | null
    return typeof value?.user?.id === 'string' ? value.user.id : null
  } catch {
    return null
  }
}

// One client for the whole app, made on first use. The library is fetched
// then too, so the demo never downloads it. PKCE puts the sign-in code in
// the query string (?code=...), before the #, so it never collides with the
// router, which owns everything after the #.
export function supabase(): Promise<SupabaseClient> {
  const settings = runtime.supabase
  if (!settings) return Promise.reject(new Error('Supabase isn’t set up in config.js'))
  client ??= import('@supabase/supabase-js')
    .then(({ createClient }) =>
      createClient(settings.url, settings.anonKey, {
        auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true, autoRefreshToken: true, storageKey: STORAGE_KEY },
      }),
    )
    .catch((error: unknown) => {
      // A failed download (a flaky phone connection, say) mustn't stick:
      // forget it so the next try fetches the library again.
      client = null
      throw error
    })
  return client
}

// Where the email link brings you back: this site's own address, with no #
// route, so Supabase can add ?code= cleanly. The same URL has to be on
// Supabase's Redirect URLs list (README).
export const returnUrl = () => `${window.location.origin}${import.meta.env.BASE_URL}`

// The sign-in code is single-use and has done its job once the session
// exists, so take it out of the address bar (and out of anything that reads
// the URL later, like analytics). The # route is kept.
export function forgetSignInCode() {
  const url = new URL(window.location.href)
  if (!url.searchParams.has('code')) return
  url.searchParams.delete('code')
  window.history.replaceState(window.history.state, '', url)
}

export async function currentSession(): Promise<Session | null> {
  const { data, error } = await (await supabase()).auth.getSession()
  if (error) throw error
  return data.session
}

export function onAuthChange(listener: (event: AuthChangeEvent, session: Session | null) => void): () => void {
  let stopped = false
  let stop = () => {
    stopped = true
  }
  supabase()
    .then((db) => {
      if (stopped) return
      const { data } = db.auth.onAuthStateChange(listener)
      stop = () => data.subscription.unsubscribe()
    })
    .catch(() => {
      // The library didn't load; AuthProvider shows that and offers a retry.
    })
  return () => stop()
}

// Sends the email with the link and a 6-digit code (the code shows if the
// email template includes it, see README). It never makes an account: the
// attendance importer makes one for each rep on the roster, and public
// sign-ups stay off, so nobody can register a rep's address first.
export async function sendSignInEmail(email: string): Promise<void> {
  const { error } = await (await supabase()).auth.signInWithOtp({ email, options: { emailRedirectTo: returnUrl(), shouldCreateUser: false } })
  if (error) throw error
}

export async function verifySignInCode(email: string, token: string): Promise<void> {
  const { error } = await (await supabase()).auth.verifyOtp({ email, token, type: 'email' })
  if (error) throw error
}

// Signs out of this browser. 'local' removes the session here before it
// asks the server to revoke it, so a dropped connection can't leave someone
// signed in on a shared computer after they pressed Sign out.
export async function signOut(): Promise<void> {
  const { error } = await (await supabase()).auth.signOut({ scope: 'local' })
  if (error) throw error
}

// What a stamp row looks like coming back, with its activity joined on.
interface StampFromDb {
  earned_at: string
  activity: { type: string; title: string; supplier: string | null; location: string | null } | null
}

// The signed-in rep's passport, or null when they're signed in but not on
// the roster (no rep row they can see). Row-level security limits both
// queries to their own rows; nothing here filters by user.
export async function loadLiveData(signal?: AbortSignal): Promise<PassportData | null> {
  const db = await supabase()
  const rep = await db.from('reps').select('email, name, team').abortSignal(signal ?? new AbortController().signal).maybeSingle()
  if (rep.error) throw new DataError(`Supabase wouldn’t return your rep row: ${rep.error.message}`)
  if (!rep.data) return null
  const stamps = await db
    .from('stamps')
    .select('earned_at, activity:activities (type, title, supplier, location)')
    .order('earned_at')
    .abortSignal(signal ?? new AbortController().signal)
  if (stamps.error) throw new DataError(`Supabase wouldn’t return your stamps: ${stamps.error.message}`)

  // The passport tells stamps apart by activity, day and title. A training
  // imported once with no format (so virtual) and again as in person is two
  // rows here but one stamp there, so keep the in-person one.
  const byStamp = new Map<string, StampRow>()
  // The same id the passport gives a stamp (lib/model.ts), so the two agree.
  const stampKey = (row: StampRow) => stampFrom(row).id
  const rows: StampRow[] = []
  for (const s of (stamps.data ?? []) as unknown as StampFromDb[]) {
    if (!s.activity || !isActivityType(s.activity.type)) continue
    const { activity, format } = activityOf(s.activity.type)
    const row: StampRow = {
      rep_email: rep.data.email,
      activity,
      event: s.activity.title,
      supplier: s.activity.supplier ?? '',
      date: s.earned_at,
      format,
      location: s.activity.location ?? '',
    }
    const twin = byStamp.get(stampKey(row))
    if (twin && twin.format === 'in person') continue
    if (twin) rows.splice(rows.indexOf(twin), 1)
    byStamp.set(stampKey(row), row)
    rows.push(row)
  }
  return {
    reps: [{ rep_email: rep.data.email, rep_name: rep.data.name, team: rep.data.team ?? '', start_date: '' }],
    stamps: rows,
  }
}
