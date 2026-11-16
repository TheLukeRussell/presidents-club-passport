// App-wide state: loads the data, layers the demo's recordings on top, and
// hands the passport and standings everything they need. Screens read it with useApp().

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ACTIVITIES, DEMO_REP, DEMO_SEED, DEMO_SHARE, DEMO_TODAY, type Activity } from '../config'
import { DataError, loadData } from '../data/source'
import type { PassportData } from '../data/types'
import type { Span } from '../lib/board'
import { demoStamp, demoStamps, GROUP_EVENTS, pickAttendees, pickDefaultRep } from '../lib/demo'
import { buildModel, findRep, withStamps, type Model, type Rep } from '../lib/model'
import { standings, type StandingRow } from '../lib/ranking'
import type { Context } from '../lib/rules'
import { readSaved, writeSaved, type SavedDemo } from './storage'

export type LoadStatus = 'loading' | 'error' | 'empty' | 'ready'
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

// A stamp that still has its moment to play, as `${email}|${activity}`.
export const landingKey = (email: string, activity: Activity) => `${email}|${activity}`

interface AppValue {
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

export function AppProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<PassportData | null>(null)
  const [error, setError] = useState<string | null>(null)
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
    const controller = new AbortController()
    loadData(controller.signal)
      .then(setData)
      .catch((err: unknown) => {
        if (controller.signal.aborted) return
        setError(err instanceof DataError ? err.message : 'Something went wrong reading the passport data.')
      })
    return () => controller.abort()
  }, [attempt])

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
    // Each activity's recording, in order. Emails no longer in the data just
    // drop out, and a rep who already has the stamp doesn't get it twice.
    let model = baseModel
    for (const activity of ACTIVITIES) {
      const emails = saved.recorded?.[activity]
      if (emails?.length) model = withStamps(model, demoStamps(baseModel, activity, emails, CTX))
    }
    const viewAs = (saved.viewAs && findRep(baseModel, saved.viewAs)) || pickDefaultRep(baseModel, CTX, DEMO_REP) || baseModel.reps[0]
    return { model, ctx: CTX, board: standings(model, CTX), viewAs }
  }, [baseModel, saved])

  const status: LoadStatus =
    preview !== 'live' ? preview : error ? 'error' : !data ? 'loading' : ready ? 'ready' : 'empty'

  const setViewAs = useCallback((repId: string) => setSaved((s) => ({ ...s, viewAs: repId })), [])

  // A group event (a training, a fair, Club Express) is one event today, so
  // it records once. A Hub course or the quota is one rep's own, so each rep
  // can get one.
  const recordBlock = useCallback(
    (activity: Activity, repId?: string): RecordBlock => {
      if (!ready || !baseModel) return 'nothing-left'
      const rep = (repId && findRep(baseModel, repId)) || ready.viewAs
      const emails = saved.recorded?.[activity] ?? []
      if (GROUP_EVENTS.includes(activity) ? emails.length > 0 : emails.includes(rep.email)) return 'recorded'
      if (demoStamp(ready.model, rep, activity, CTX)) return null
      return activity === 'hub' ? 'nothing-left' : 'has-it'
    },
    [ready, baseModel, saved],
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
      setLanding((current) => new Set([...current, ...emails.map((email) => landingKey(email, activity))]))
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
    status,
    error: preview === 'error' ? 'This is a preview of the error state. Nothing is actually broken.' : error,
    retry: () => {
      setPreview('live')
      setData(null)
      setError(null)
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
