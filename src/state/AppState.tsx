// App-wide state: loads the data, layers the demo's recordings on top, and
// hands the passport and standings everything they need. Screens read it with useApp().
//
// In the demo the data is the sample JSON and today is DEMO_TODAY. In the
// live passport (runtime.mode 'live') the data is the signed-in rep's own row
// and stamps from Supabase, today is the real date, and the demo's
// recordings are left out.

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ACTIVITIES, DEMO_REP, DEMO_SEED, DEMO_SHARE, DEMO_TODAY, type Activity } from '../config'
import { loadLiveData } from '../data/live'
import { DataError, loadData } from '../data/source'
import type { PassportData } from '../data/types'
import type { Span } from '../lib/board'
import { demoStamp, demoStamps, GROUP_EVENTS, landingKey, pickAttendees, pickDefaultRep } from '../lib/demo'
import { buildModel, findRep, withStamps, type Model, type Rep } from '../lib/model'
import { standings, type StandingRow } from '../lib/ranking'
import { repStats, type Context } from '../lib/rules'
import { todayInProgram } from '../lib/today'
import { runtime } from '../runtime'
import { useAuth } from './Auth'
import { celebratedBefore, noteCelebrated, readSaved, writeSaved, type SavedDemo } from './storage'
import { track, trackCompletion } from '../analytics/posthog'
import { activityTypeOf } from '../data/activity-types'

// signed-out and not-on-roster only happen in the live passport.
export type LoadStatus = 'loading' | 'error' | 'empty' | 'ready' | 'signed-out' | 'not-on-roster'
export type Preview = 'live' | 'loading' | 'empty' | 'error'

// The board as it stood just before something was recorded, so Standings can
// slide each row from where it was: the order, and who had qualified.
export interface SlideFrom {
  order: string[]
  above: ReadonlySet<string>
}

// Gaps opened on the short board with Show more, for one team filter (the
// key). Standings drops them once it changes. They live here so they're
// still open when you come back from a passport.
export interface OpenedGaps {
  key: string
  spans: Span[]
}

interface Ready {
  model: Model
  ctx: Context
  board: StandingRow[]
  viewAs: Rep
}

// Why Record can't run for a rep right now, or null when it can.
export type RecordBlock = 'recorded' | 'has-it' | 'nothing-left' | null

interface AppValue {
  // True for the live passport (signed in, reading Supabase), false for the demo.
  live: boolean
  status: LoadStatus
  error: string | null
  retry: () => void
  ready: Ready | null
  setViewAs: (repId: string) => void
  // Stamps one activity, dated today. Pass the rep whose passport is open so
  // they get the stamp; with no rep it uses whoever you're viewing as.
  record: (activity: Activity, repId?: string) => void
  recordBlock: (activity: Activity, repId?: string) => RecordBlock
  recorded: ReadonlySet<Activity> // activities recorded at least once
  reset: () => void
  undoReset: () => void
  canUndo: boolean
  storageOk: boolean
  slideFrom: SlideFrom | null
  clearSlide: () => void
  landing: ReadonlySet<string>
  landed: (key: string) => void
  openedGaps: OpenedGaps
  openGap: (key: string, span: Span) => void
  closeGaps: () => void
  preview: Preview
  setPreview: (preview: Preview) => void
}

const AppContext = createContext<AppValue | null>(null)

const UNDO_MS = 10000
const CTX: Context = { today: DEMO_TODAY }

// What came back, and for whom: the live passport throws it away when
// someone else signs in on the same page.
interface Loaded {
  user: string | null
  data: PassportData
  onRoster: boolean
  today: string
}

export function AppProvider({ children }: { children: ReactNode }) {
  const live = runtime.mode === 'live'
  const auth = useAuth()
  const userId = live ? auth.userId : null
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  // An error belongs to whoever was signed in when it happened, so signing
  // in again (as anyone) starts clean.
  const [failure, setFailure] = useState<{ user: string | null; message: string } | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [preview, setPreview] = useState<Preview>('live')

  // Read storage once, up front. If it throws, we know it is blocked.
  const [initial] = useState(readSaved)
  const [saved, setSaved] = useState<SavedDemo>(initial.saved)
  const storageOk = initial.ok
  const [undo, setUndo] = useState<SavedDemo | null>(null)
  const [slideFrom, setSlideFrom] = useState<SlideFrom | null>(null)
  const [landing, setLanding] = useState<ReadonlySet<string>>(new Set())
  const [openedGaps, setOpenedGaps] = useState<OpenedGaps>({ key: '', spans: [] })

  useEffect(() => {
    // The live passport has nothing to load until someone signs in.
    if (live && !userId) return
    const controller = new AbortController()
    const load: Promise<Loaded> = live
      ? loadLiveData(controller.signal).then((found) => ({
          user: userId,
          data: found ?? { reps: [], stamps: [] },
          onRoster: found !== null,
          today: todayInProgram(),
        }))
      : loadData(controller.signal).then((found) => ({ user: null, data: found, onRoster: true, today: DEMO_TODAY }))
    load
      .then((next) => {
        if (controller.signal.aborted) return
        setLoaded(next)
        // A rep who's met all five gets the cover's celebration once, the
        // first time this browser opens their passport after it happens.
        if (live && next.user && next.onRoster) {
          const model = buildModel(next.data)
          const rep = model.reps[0]
          const stats = rep ? repStats(model, rep, { today: next.today }) : null
          if (rep && stats?.qualified) {
            // passport_completed, once per rep per browser (see analytics).
            trackCompletion(next.user, { stamps_total: stats.total, as_of: next.today, source: 'supabase' })
            if (!celebratedBefore(next.user)) {
              noteCelebrated(next.user)
              setLanding((current) => new Set([...current, landingKey(rep.email, 'qualified')]))
            }
          }
        }
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return
        setFailure({ user: userId, message: err instanceof DataError ? err.message : 'Something went wrong reading the passport data.' })
      })
    return () => controller.abort()
  }, [attempt, live, userId])
  const unavailable = live && auth.status === 'unavailable'
  const error = unavailable
    ? 'Couldn’t reach the sign-in service. Check the connection and try again.'
    : failure && failure.user === userId
      ? failure.message
      : null

  // Only what was loaded for whoever is signed in now counts.
  const current = loaded && loaded.user === userId ? loaded : null
  const data = current?.data ?? null
  const ctx = useMemo<Context>(() => (live ? { today: current?.today ?? todayInProgram() } : CTX), [live, current?.today])

  // Write-through to storage. A failed write is fine: the demo keeps working
  // from memory, it just won't survive a reload.
  useEffect(() => {
    writeSaved(saved)
  }, [saved])

  // The undo offer goes away on its own after a bit.
  useEffect(() => {
    if (!undo) return
    const timer = window.setTimeout(() => setUndo(null), UNDO_MS)
    return () => window.clearTimeout(timer)
  }, [undo])

  const baseModel = useMemo(() => (data ? buildModel(data) : null), [data])

  const ready = useMemo<Ready | null>(() => {
    if (!baseModel || baseModel.reps.length === 0) return null
    // Live: one rep, their own stamps, nothing recorded on top.
    if (live) return { model: baseModel, ctx, board: standings(baseModel, ctx), viewAs: baseModel.reps[0] }
    // Each activity's recording, in order. Emails no longer in the data just
    // drop out, and a rep who already has the stamp doesn't get it twice.
    let model = baseModel
    for (const activity of ACTIVITIES) {
      const emails = saved.recorded?.[activity]
      if (emails?.length) model = withStamps(model, demoStamps(baseModel, activity, emails, CTX))
    }
    const viewAs = (saved.viewAs && findRep(baseModel, saved.viewAs)) || pickDefaultRep(baseModel, CTX, DEMO_REP) || baseModel.reps[0]
    return { model, ctx: CTX, board: standings(model, CTX), viewAs }
  }, [baseModel, saved, live, ctx])

  const signedOut = live && (auth.status === 'signed-out' || (auth.status === 'signed-in' && !userId))
  const status: LoadStatus =
    preview !== 'live'
      ? preview
      : live && auth.status === 'checking'
        ? 'loading'
        : unavailable
          ? 'error'
        : signedOut
          ? 'signed-out'
          : error
            ? 'error'
            : !data
              ? 'loading'
              : current && !current.onRoster
                ? 'not-on-roster'
                : ready
                  ? 'ready'
                  : 'empty'

  const setViewAs = useCallback((repId: string) => setSaved((s) => ({ ...s, viewAs: repId })), [])

  // A group event (a training, a fair, Club Express) is one event today, so
  // it records once. A Hub course or the quota is one rep's own, so each rep
  // can get one.
  const recordBlock = useCallback(
    (activity: Activity, repId?: string): RecordBlock => {
      // The live passport never records: stamps only come from Supabase.
      if (live || !ready || !baseModel) return 'nothing-left'
      const rep = (repId && findRep(baseModel, repId)) || ready.viewAs
      const emails = saved.recorded?.[activity] ?? []
      if (GROUP_EVENTS.includes(activity) ? emails.length > 0 : emails.includes(rep.email)) return 'recorded'
      if (demoStamp(ready.model, rep, activity, CTX)) return null
      return activity === 'hub' ? 'nothing-left' : 'has-it'
    },
    [ready, baseModel, saved, live],
  )

  const record = useCallback(
    (activity: Activity, repId?: string) => {
      if (!ready || !baseModel || recordBlock(activity, repId)) return
      // The rep being recorded is the one whose passport is open, when there
      // is one. They become the rep you're viewing as, so Standings highlights
      // the same person whose stamp just landed.
      const rep = (repId && findRep(baseModel, repId)) || ready.viewAs
      const emails = pickAttendees(ready.model, activity, rep, DEMO_SHARE, DEMO_SEED, CTX)
      // Remember the board order from right before, so Standings can slide
      // each row from where it was to where it lands.
      setSlideFrom({
        order: ready.board.map((row) => row.rep.id),
        above: new Set(ready.board.filter((row) => row.above).map((row) => row.rep.id)),
      })
      // Anyone this recording takes to all five also gets the cover's
      // celebration, which plays once their stamp has landed.
      const after = withStamps(ready.model, demoStamps(baseModel, activity, emails, CTX))
      const qualified = emails.filter((email) => {
        const r = after.reps.find((x) => x.email === email)
        return r && !repStats(ready.model, r, CTX).qualified && repStats(after, r, CTX).qualified
      })
      setLanding(
        (current) =>
          new Set([...current, ...emails.map((email) => landingKey(email, activity)), ...qualified.map((email) => landingKey(email, 'qualified'))]),
      )
      // The demo's version of passport_completed: a Record that took someone
      // to all five. Sample reps only, so nothing about who.
      for (let i = 0; i < qualified.length; i++) track('passport_completed', { source: 'demo', activity_type: activityTypeOf(activity, 'in person') })
      setUndo(null)
      setSaved((s) => ({
        ...s,
        viewAs: rep.id,
        recorded: { ...s.recorded, [activity]: [...(s.recorded?.[activity] ?? []), ...emails] },
      }))
    },
    [ready, baseModel, recordBlock],
  )

  const recorded = useMemo(
    () => new Set(ACTIVITIES.filter((a) => (saved.recorded?.[a]?.length ?? 0) > 0)) as ReadonlySet<Activity>,
    [saved],
  )

  // Reset keeps a copy of what it wiped so Undo can put it back.
  // A second press while Undo is still up has nothing new to wipe, so it
  // keeps the first copy instead of saving an empty one over it.
  const reset = useCallback(() => {
    setUndo((prev) => (saved.recorded || saved.viewAs ? saved : prev))
    setSaved({})
    setSlideFrom(null)
    setLanding(new Set())
  }, [saved])

  const undoReset = useCallback(() => {
    if (!undo) return
    setSaved(undo)
    setUndo(null)
  }, [undo])

  const clearSlide = useCallback(() => setSlideFrom(null), [])

  // Pressing See all twice opens the same run twice. Keep one copy.
  const openGap = useCallback(
    (key: string, span: Span) =>
      setOpenedGaps((current) => {
        if (current.key !== key) return { key, spans: [span] }
        if (current.spans.some((s) => s.start === span.start && s.end === span.end)) return current
        return { key, spans: [...current.spans, span] }
      }),
    [],
  )
  const closeGaps = useCallback(() => setOpenedGaps({ key: '', spans: [] }), [])

  const landed = useCallback((key: string) => {
    setLanding((current) => {
      if (!current.has(key)) return current
      const next = new Set(current)
      next.delete(key)
      return next
    })
  }, [])

  const value: AppValue = {
    live,
    status,
    error: preview === 'error' ? 'This is a preview of the error state. Nothing is actually broken.' : error,
    retry: () => {
      setPreview('live')
      if (unavailable) return auth.retry()
      setLoaded(null)
      setFailure(null)
      setAttempt((n) => n + 1)
    },
    ready: status === 'ready' ? ready : null,
    setViewAs,
    record,
    recordBlock,
    recorded,
    reset,
    undoReset,
    canUndo: undo !== null,
    storageOk,
    slideFrom,
    clearSlide,
    landing,
    landed,
    openedGaps,
    openGap,
    closeGaps,
    preview,
    setPreview,
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp(): AppValue {
  const value = useContext(AppContext)
  if (!value) throw new Error('useApp needs to sit inside <AppProvider>')
  return value
}
