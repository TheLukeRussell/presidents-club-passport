// The demo-only panel: switch who you're viewing as, record a stamp from
// today's events, reset (with undo), and preview the loading, empty and
// error states. None of this ships in the real version.

import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { ACTIVITIES, DEMO_EVENTS, TEAMS, type Activity } from '../../config'
import { demoStamp, GROUP_EVENTS } from '../../lib/demo'
import { firstName } from '../../lib/format'
import type { Rep } from '../../lib/model'
import { TURN_MS, pageForActivity, parsePage, viewForPage } from '../../lib/book'
import { useApp, type Preview, type RecordBlock } from '../../state/AppState'
import { useReducedMotion, useSpread } from '../../state/useMedia'
import './DemoPanel.css'

interface Props {
  open: boolean
  onClose: () => void
}

// What each Record button says.
const RECORD_LABELS: Record<Activity, string> = {
  training: 'Supplier training',
  fair: 'Supplier fair',
  hub: 'Hub course',
  club: 'Club Express',
  quota: 'Quota',
}

// What the help line says was just recorded.
const RECORDED: Record<Activity, string> = {
  training: 'today’s supplier training',
  fair: 'today’s supplier fair',
  hub: 'a Hub course',
  club: DEMO_EVENTS.club.event,
  quota: 'the quota',
}

// Reps by team for View as, plus an Other group for anyone whose team in the
// sheet isn't one of the five. Without it they couldn't be picked, and the
// box showed someone else's name while they were the one viewing.
function teamGroups(reps: Rep[]): [string, Rep[]][] {
  const known: readonly string[] = TEAMS
  const groups: [string, Rep[]][] = TEAMS.map((team) => [team, reps.filter((rep) => rep.team === team)])
  const other = reps.filter((rep) => !known.includes(rep.team))
  return other.length ? [...groups, ['Other', other]] : groups
}

const PREVIEWS: { value: Preview; label: string }[] = [
  { value: 'live', label: 'Live data' },
  { value: 'loading', label: 'Loading' },
  { value: 'empty', label: 'Empty' },
  { value: 'error', label: 'Error' },
]

// The small line under a used-up button, and the sentence a screen reader
// hears for it.
function blockedWhy(activity: Activity, block: Exclude<RecordBlock, null>, name: string): { short: string; long: string } {
  switch (block) {
    case 'recorded':
      return {
        short: 'Recorded',
        long: `Already recorded${activity === 'hub' || activity === 'quota' ? ` for ${name}` : ' today'}. Reset the demo to run it again.`,
      }
    case 'has-it':
      return activity === 'quota'
        ? { short: 'Already sealed', long: `${name} already has the gold seal.` }
        : { short: 'Already stamped', long: `${name} already has today’s stamp.` }
    case 'nothing-left':
      return { short: 'Every course done', long: `${name} has done every Hub course already.` }
  }
}

export function DemoPanel({ open, onClose }: Props) {
  const app = useApp()
  const reduced = useReducedMotion()
  const spread = useSpread()
  const { ready } = app
  const navigate = useNavigate()
  const { pathname, search } = useLocation()
  // True from the click until the turn lands and the stamp actually gets recorded.
  const [turning, setTurning] = useState(false)
  const [last, setLast] = useState<{ activity: Activity; name: string } | null>(null)
  const resetRef = useRef<HTMLButtonElement>(null)
  const hadUndo = useRef(false)
  // On a passport, "the current rep" is the one whose passport is open,
  // which may not be the rep in the View as box.
  const passportId = /^\/passport\/([^/]+)/.exec(pathname)?.[1]
  const passportRep = (ready && passportId && ready.model.reps.find((rep) => rep.id === passportId)) || null
  const recordRep = passportRep ?? ready?.viewAs

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || document.querySelector('dialog[open]')) return
      // Closing from inside the panel hands focus back to the Demo button,
      // instead of dropping it on the page.
      if (document.getElementById('demo-panel')?.contains(document.activeElement)) {
        document.querySelector<HTMLElement>('.topbar__demo')?.focus()
      }
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Undo goes away once it's used (or times out). If it had focus, put it
  // on Reset demo instead of losing it.
  useEffect(() => {
    if (hadUndo.current && !app.canUndo && (!document.activeElement || document.activeElement === document.body)) {
      resetRef.current?.focus()
    }
    hadUndo.current = app.canUndo
  }, [app.canUndo])

  const onViewAs = (repId: string) => {
    app.setViewAs(repId)
    // On a passport, switching who you are opens your own passport.
    if (pathname.startsWith('/passport')) navigate(`/passport/${repId}?page=2`)
  }

  // What each button would stamp for this rep, for the line under its name.
  const detailFor = (activity: Activity): string => {
    switch (activity) {
      case 'training':
        return [DEMO_EVENTS.training.supplier, DEMO_EVENTS.training.format].filter(Boolean).join(', ')
      case 'fair':
        return DEMO_EVENTS.fair.event
      case 'hub': {
        const next = ready && recordRep ? demoStamp(ready.model, recordRep, 'hub', ready.ctx) : null
        return next ? `${next.supplier} course` : 'On the Hub'
      }
      case 'club': {
        const { event, location } = DEMO_EVENTS.club
        const which = event.replace(/^Club Express\s*/i, '')
        return which && location ? `${which}, ${location}` : event
      }
      case 'quota':
        return 'Gold seal'
    }
  }

  // Record buttons stay focusable once they're used up (aria-disabled, not
  // disabled), so keyboard focus doesn't drop out of the panel. Clicks then
  // do nothing, and the line under the name says why.
  const blockOf = (activity: Activity) => app.recordBlock(activity, passportRep?.id)
  const recordOff = (activity: Activity) => turning || blockOf(activity) !== null
  const onRecord = (activity: Activity) => {
    if (!ready || recordOff(activity)) return
    const repId = passportRep?.id
    setLast({ activity, name: firstName(recordRep!.name) })
    if (!pathname.startsWith('/passport')) {
      app.record(activity, repId)
      return
    }
    // Recording from a passport turns to that activity's page, so you
    // actually see the stamp land. On a phone this panel pushes the book down
    // the screen, so bring the book up first and the turn plays in view.
    const book = document.querySelector('.passport')
    if (book && book.getBoundingClientRect().top > window.innerHeight * 0.4) {
      book.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' })
    }
    const target = pageForActivity(activity)
    const there = viewForPage(parsePage(new URLSearchParams(search).get('page')), spread) === viewForPage(target, spread)
    navigate(`${pathname}?page=${target}`, { replace: true })
    // Record only once the page has turned. Recording first showed the new
    // numbers and the new stamp on the moving paper, then the stamper came
    // down on a slot that was already inked.
    if (there || reduced) {
      app.record(activity, repId)
      return
    }
    setTurning(true)
    window.setTimeout(() => {
      app.record(activity, repId)
      setTurning(false)
    }, TURN_MS + 80)
  }

  const name = recordRep ? firstName(recordRep.name) : ''

  return (
    <section id="demo-panel" className="demo" aria-labelledby="demo-title" hidden={!open}>
      <div className="demo__inner container">
        <div className="demo__head">
          <h2 id="demo-title" className="demo__title">
            Demo controls
          </h2>
          <p className="demo__note">Only here for the demo, which runs on made-up sample data. The real passport won’t have this panel.</p>
        </div>

        {ready && (
          <div className="field demo__viewas">
            <label htmlFor="view-as">View as</label>
            <select id="view-as" className="input" value={ready.viewAs.id} onChange={(e) => onViewAs(e.target.value)}>
              {teamGroups(ready.model.reps).map(([team, reps]) => (
                <optgroup key={team} label={team}>
                  {reps.map((rep) => (
                    <option key={rep.id} value={rep.id}>
                      {rep.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
        )}

        {ready && (
          <div className="demo__record">
            <p id="record-title" className="demo__label">
              Record a stamp for {name}
            </p>
            <div className="demo__record-buttons" role="group" aria-labelledby="record-title">
              {ACTIVITIES.map((activity) => {
                const block = blockOf(activity)
                const why = block ? blockedWhy(activity, block, name) : null
                return (
                  <button
                    key={activity}
                    type="button"
                    className={`btn demo__rec demo__rec--${activity}`}
                    onClick={() => onRecord(activity)}
                    aria-disabled={recordOff(activity) || undefined}
                    aria-describedby={why ? `rec-why-${activity}` : `rec-sub-${activity}`}
                  >
                    <span className="demo__rec-name">{RECORD_LABELS[activity]}</span>
                    {/* Kept out of the button's name, so it's always just
                        the activity. The line is its description instead,
                        and a used-up button's description says why in full. */}
                    <span id={`rec-sub-${activity}`} className="demo__rec-sub" aria-hidden="true">
                      {why ? why.short : detailFor(activity)}
                    </span>
                    {why && (
                      <span id={`rec-why-${activity}`} hidden>
                        {why.long}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
            <p className="demo__help" aria-live="polite">
              {last && app.recorded.has(last.activity)
                ? `Recorded ${RECORDED[last.activity]} for ${last.name}${GROUP_EVENTS.includes(last.activity) ? ' and the others who were there' : ''}. Reset to run it again.`
                : 'Each button stamps one of today’s events. A training, fair or Club Express stamps about two thirds of everyone else there too. Quota plays the gold seal.'}
            </p>
          </div>
        )}

        <div className="demo__reset">
          <button ref={resetRef} type="button" className="btn btn--quiet" onClick={app.reset} disabled={!ready}>
            Reset demo
          </button>
          <p className="demo__help" role="status">
            {app.canUndo ? (
              <>
                Demo reset.{' '}
                <button type="button" className="link-btn" onClick={app.undoReset}>
                  Undo
                </button>
              </>
            ) : null}
          </p>
        </div>

        {/* Toggle buttons, not radios: a radio keeps the arrow keys, so turning
            a page after a preview used to flip the app to Loading or Error. */}
        <fieldset className="seg demo__states">
          <legend>Data states</legend>
          {PREVIEWS.map((p) => (
            <button
              key={p.value}
              type="button"
              className="demo__state"
              aria-pressed={app.preview === p.value}
              onClick={() => app.setPreview(p.value)}
            >
              {p.label}
            </button>
          ))}
        </fieldset>

        {!app.storageOk && (
          <p className="demo__warn">This browser is blocking storage, so demo changes last until you reload.</p>
        )}
      </div>
    </section>
  )
}
