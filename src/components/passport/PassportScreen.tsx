// The Passport screen: the book for one rep, the page controls under it, and
// the stamp detail slip. The page lives in the URL (?page=4), so a link can
// open straight to an activity's page. The book can be picked up and tilted
// too (see useTilt.ts).

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { Link, Navigate, useParams, useSearchParams } from 'react-router'
import { track } from '../../analytics/posthog'
import { usePassportViewed } from '../../analytics/usePassportViewed'
import { ACTIVITIES, type Activity } from '../../config'
import { activityTypeOf } from '../../data/activity-types'
import { BACK_COVER, CHECKLIST_PAGE, DATA_PAGE, PAGES, SEAL_PAGE, pageForActivity, pageForView, pagesInView, parsePage, viewCount, viewForPage, viewLabel } from '../../lib/book'
import { findRep, type Stamp } from '../../lib/model'
import { landingKey } from '../../lib/demo'
import { useApp } from '../../state/AppState'
import { useReducedMotion, useSpread } from '../../state/useMedia'
import { ActivityPage } from './ActivityPage'
import { BackCover } from './BackCover'
import { Book } from './Book'
import { ChecklistPage } from './ChecklistPage'
import { Cover } from './Cover'
import { DataPage } from './DataPage'
import { NotesPage } from './NotesPage'
import { PassportPicker } from './PassportPicker'
import { SealPage } from './SealPage'
import { StampDetail } from './StampDetail'
import { isPinchZoomed, usePinchZoom } from './usePinchZoom'
import { useTilt } from './useTilt'
import './PassportScreen.css'

// How far a finger has to travel sideways before it counts as a swipe.
const SWIPE_PX = 48
// After the last stamp of the five lands, a beat to read its endorsement
// before the book turns to the cover for the celebration.
const READ_MS = 1100
// Places where the arrow keys move a text cursor, so they keep them.
const TYPING = 'textarea, [contenteditable="true"], input:not([type="radio"], [type="checkbox"], [type="button"], [type="submit"], [type="reset"])'

export function PassportScreen() {
  const app = useApp()
  const { model, ctx, board, viewAs } = app.ready!
  const { repId = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const spread = useSpread()
  const reduced = useReducedMotion()
  const zoomed = usePinchZoom()
  const [detail, setDetail] = useState<Stamp | null>(null)
  const swipe = useRef<{ x: number; y: number; id: number } | null>(null)
  const swiped = useRef(false)
  const tilt = useTilt(reduced)
  const { ref: tiltRef, onPointerMove: onTiltMove, onLostPointerCapture: onTiltLost } = tilt

  const rep = findRep(model, repId)
  // One per activity, and stable, so a stamp moment's timer isn't restarted
  // by every re-render.
  const repEmail = rep?.email
  const { landed } = app
  const onLanded = useMemo(
    () =>
      Object.fromEntries(
        ACTIVITIES.map((a) => [
          a,
          () => {
            if (repEmail) landed(landingKey(repEmail, a))
          },
        ]),
      ) as Record<Activity, () => void>,
    [landed, repEmail],
  )
  const page = parsePage(params.get('page'))
  const view = viewForPage(page, spread)
  const last = viewCount(spread) - 1

  usePassportViewed(rep?.id, board, viewAs.id, page)

  const goToView = useCallback(
    (next: number) => {
      const target = Math.max(0, Math.min(last, next))
      setParams(
        (current) => {
          const out = new URLSearchParams(current)
          const p = pageForView(target, spread)
          if (p === 0) out.delete('page')
          else out.set('page', String(p))
          return out
        },
        { replace: true },
      )
    },
    [last, setParams, spread],
  )

  // Left and right arrow keys turn pages, unless you're typing somewhere or
  // the detail slip is open. On a button, a radio or a select (the demo
  // panel, the passport picker) they still turn pages, and preventDefault
  // stops them from changing the choice or the rep on the way.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (detail || event.altKey || event.metaKey || event.ctrlKey) return
      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
      const target = event.target as HTMLElement | null
      if (target?.closest(TYPING)) return
      goToView(event.key === 'ArrowRight' ? view + 1 : view - 1)
      event.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [detail, goToView, view])

  // A Record that met the fifth minimum leaves the cover's celebration to
  // play. Once the stamp moment on the page in front of you has landed, the
  // book turns to the front cover, and it plays there (Cover.tsx). Only a
  // moment that's showing holds it back: a rep recorded from Standings gets
  // the celebration as soon as their passport opens.
  const celebrate = Boolean(repEmail && app.landing.has(landingKey(repEmail, 'qualified')))
  const showing = pagesInView(view, spread)
  const stampsPending = Boolean(
    repEmail && ACTIVITIES.some((a) => app.landing.has(landingKey(repEmail, a)) && showing.includes(pageForActivity(a))),
  )
  const cheering = celebrate && !stampsPending
  useEffect(() => {
    if (!cheering || view === 0) return
    const timer = window.setTimeout(() => goToView(0), reduced ? 0 : READ_MS)
    return () => window.clearTimeout(timer)
  }, [cheering, view, goToView, reduced])
  const onCelebrated = useCallback(() => {
    if (repEmail) landed(landingKey(repEmail, 'qualified'))
  }, [landed, repEmail])

  // A checklist row turns to its page and puts focus on that page, not on
  // whichever page of the spread comes first. When the page is already
  // showing (quota's, next to the checklist on a spread), focus goes there now.
  const focusPage = useRef<number | null>(null)
  const takeFocusPage = useCallback(() => {
    const page = focusPage.current
    focusPage.current = null
    return page
  }, [])
  const goToPage = (target: number) => {
    if (viewForPage(target, spread) !== view) {
      focusPage.current = target
      goToView(viewForPage(target, spread))
      return
    }
    const page = document.querySelector<HTMLElement>(`.book__slot .book__sheet > [data-folio="${target}"]`)
    if (!page) return
    page.tabIndex = -1
    page.focus({ preventScroll: true })
  }

  // The live passport is only ever your own. Any other rep's address (an old
  // link from the demo, say) opens yours on the same page.
  if (app.live && repId !== viewAs.id) {
    return <Navigate to={`/passport/${viewAs.id}${page ? `?page=${page}` : ''}`} replace />
  }

  if (!rep) {
    return (
      <div className="container">
        <section className="passport-missing" aria-labelledby="missing-title">
          <h1 id="missing-title" className="passport-missing__title">
            No passport for “{repId}”
          </h1>
          <p>That rep ID isn’t in the passport data. It may have a typo, or the rep may not be on the sheet.</p>
          <p>
            <Link to="/standings">Find them on the standings</Link> or <Link to={`/passport/${viewAs.id}`}>open {viewAs.name}’s passport</Link>.
          </p>
        </section>
      </div>
    )
  }

  const row = board.find((r) => r.rep.id === rep.id)!
  const { stats } = row
  const landing = (activity: Activity) => app.landing.has(landingKey(rep.email, activity))

  const render = (p: number, still: boolean) => {
    if (p === 0) {
      // Until the celebration plays, the cover keeps its blind ring, even on
      // the turning leaf, so the seal arrives with the burst and not before.
      const playing = cheering && !still
      return (
        <Cover
          rep={rep}
          qualified={stats.qualified && (!celebrate || playing)}
          celebrating={playing}
          onCelebrated={onCelebrated}
          still={still}
          onOpen={() => goToView(viewForPage(DATA_PAGE, spread))}
        />
      )
    }
    if (p === 1) return <NotesPage />
    if (p === BACK_COVER) return <BackCover rep={rep} still={still} onFront={() => goToView(0)} />
    // No rank in the live passport: a rep can only see their own stamps, so
    // there's nobody to rank them against.
    if (p === DATA_PAGE) return <DataPage rep={rep} row={row} repCount={app.live ? null : board.length} ctx={ctx} />
    if (p === CHECKLIST_PAGE) {
      // On a spread the seal page sits beside the checklist, so while the seal
      // is being pressed the checklist holds quota back. On a phone it never
      // needs to: page 7 isn't showing during the press.
      const holdQuota = landing('quota') && pagesInView(view, spread).includes(SEAL_PAGE)
      // activity_clicked: a checklist row, the one place an activity is a
      // button. Named by the stamp type its minimum counts, the same names
      // as Supabase's activities.type.
      const onGo = (target: number) => {
        const activity = PAGES[target - 1]?.activity
        if (activity) {
          const progress = stats.progress[activity]
          track('activity_clicked', {
            activity_type: activityTypeOf(activity, 'in person'),
            counted: progress.counted,
            minimum: progress.minimum,
            met: progress.met,
            from: 'checklist',
          })
        }
        goToPage(target)
      }
      return <ChecklistPage rep={rep} stats={stats} ctx={ctx} still={still} holdQuota={holdQuota} onGo={onGo} />
    }
    if (p === SEAL_PAGE) {
      return <SealPage rep={rep} stats={stats} ctx={ctx} landing={landing('quota')} onLanded={onLanded.quota} still={still} />
    }
    const activity = PAGES[p - 1].activity as Exclude<Activity, 'quota'>
    return (
      <ActivityPage
        page={p}
        activity={activity}
        rep={rep}
        stats={stats}
        ctx={ctx}
        landing={landing(activity)}
        onLanded={onLanded[activity]}
        onOpen={(stamp) => {
          // stamp_viewed: the detail slip opens. What it is, not who has it.
          track('stamp_viewed', {
            activity_type: activityTypeOf(stamp.activity, stamp.format),
            activity_title: stamp.event,
            supplier: stamp.supplier || null,
            earned_at: stamp.date,
            page: p,
          })
          setDetail(stamp)
        }}
        still={still}
      />
    )
  }

  // The click a swipe or a tilt leaves behind arrives right away. Swallow it
  // so a slot doesn't open, and if none comes, forget about it so the next
  // real tap still works.
  const swallowClick = () => {
    swiped.current = true
    window.setTimeout(() => (swiped.current = false), 350)
  }

  // Swipes: track one pointer, and on release decide if it was a sideways
  // drag. The same pointer can pick the book up and tilt it (useTilt), and a
  // tilt is never a swipe.
  const onPointerDown = (event: PointerEvent) => {
    swiped.current = false
    tilt.onPointerDown(event)
    if (event.pointerType === 'mouse') return
    swipe.current = { x: event.clientX, y: event.clientY, id: event.pointerId }
  }
  const onPointerUp = (event: PointerEvent) => {
    const start = swipe.current
    swipe.current = null
    if (tilt.onPointerUp(event)) {
      swallowClick()
      return
    }
    if (!start || start.id !== event.pointerId) return
    // Pinched in, a sideways drag is someone panning across a stamp.
    if (isPinchZoomed()) return
    const dx = event.clientX - start.x
    const dy = event.clientY - start.y
    if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) < Math.abs(dy) * 1.5) return
    swallowClick()
    goToView(dx < 0 ? view + 1 : view - 1)
  }

  return (
    <div className={`passport container${spread && (view === 0 || view === last) ? ' is-closed' : ''}${zoomed ? ' is-zoomed' : ''}`}>
      <h1 className="visually-hidden">{rep.name}’s passport</h1>
      {!app.live && <PassportPicker model={model} rep={rep} page={page} />}
      <div
        ref={tiltRef}
        className="passport__stage"
        onPointerDown={onPointerDown}
        onPointerMove={onTiltMove}
        onPointerUp={onPointerUp}
        onPointerCancel={(event) => {
          swipe.current = null
          tilt.onPointerCancel(event)
        }}
        onLostPointerCapture={onTiltLost}
        onClickCapture={(event) => {
          if (swiped.current) {
            event.preventDefault()
            event.stopPropagation()
            swiped.current = false
          }
        }}
      >
        <Book view={view} spread={spread} reduced={reduced} render={render} takeFocusPage={takeFocusPage} />
      </div>

      {/* At either end the button stays focusable (aria-disabled, not
          disabled), so keyboard focus doesn't fall off the page. */}
      <nav className="passport__controls" aria-label="Pages">
        <button
          type="button"
          className="passport__turn"
          onClick={() => view > 0 && goToView(view - 1)}
          aria-disabled={view === 0 || undefined}
          aria-label="Previous page"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15 5 8 12l7 7" />
          </svg>
        </button>
        <p className="passport__where" aria-live="polite">
          {viewLabel(view, spread)}
        </p>
        <button
          type="button"
          className="passport__turn"
          onClick={() => view < last && goToView(view + 1)}
          aria-disabled={view === last || undefined}
          aria-label="Next page"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m9 5 7 7-7 7" />
          </svg>
        </button>
      </nav>

      <StampDetail stamp={detail} model={model} rep={rep} showReps={!app.live} onClose={() => setDetail(null)} />
    </div>
  )
}
