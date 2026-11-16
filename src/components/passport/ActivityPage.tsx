// An activity page (pages 3 to 6): a slot for each stamp the minimum asks
// for, filled in date order with whatever the rep did first, and anything
// past those in an Also attended list. When the demo records one of today's
// events here, the stamper brings today's stamp down and an endorsement gets
// written in under the slots.

import { useEffect, useState } from 'react'
import { ACTIVITY_NAMES, SLOTS, type SlotActivity } from '../../config'
import { plural } from '../../lib/format'
import { countOf, endorsement } from '../../lib/messages'
import type { Rep, Stamp } from '../../lib/model'
import type { Context, Progress, RepStats } from '../../lib/rules'
import { stampLook } from '../../lib/stamps'
import { useReducedMotion } from '../../state/useMedia'
import { Page } from './Page'
import { ExtraRow, StampSlot } from './StampSlot'
import './VisaPage.css'
import './ActivityPage.css'

interface Props {
  page: number
  activity: SlotActivity
  rep: Rep
  stats: RepStats
  ctx: Context
  landing: boolean
  onLanded: () => void
  onOpen: (stamp: Stamp) => void
  still: boolean
}

// How long the whole stamp moment runs: the stamper's trip (--dur-press,
// 1400ms) with the endorsement writing itself in from 80% of the way, 620ms.
const MOMENT_MS = 1900
// When the ink shows: as the stamper lifts, 64% of --dur-press.
const INK_MS = 900

// The longest endorsement this page could ever get: a recording that meets
// the minimum and leaves the rep qualified. Its room is kept on every
// activity page, so writing the real one in never grows the book.
function longestEndorsement(activity: SlotActivity, stats: RepStats, ctx: Context): string {
  const p = stats.progress[activity]
  const stamp: Stamp = { id: 'reserve', email: '', activity, event: '', supplier: '', date: ctx.today, format: '', location: '' }
  const full: RepStats = {
    ...stats,
    qualified: true,
    activitiesDone: true,
    progress: { ...stats.progress, [activity]: { ...p, counted: p.minimum, met: true, short: 0 } },
  }
  return endorsement(stamp, full)
}

// One activity's progress without a stamp that hasn't landed yet.
function before(p: Progress, stamp: Stamp): Progress {
  const counts = p.activity !== 'training' || stamp.format === 'in person'
  const counted = counts ? p.counted - 1 : p.counted
  return { ...p, stamps: p.stamps.filter((s) => s !== stamp), counted, met: counted >= p.minimum, short: Math.max(p.minimum - counted, 0) }
}

// "2 of 4 in person · 5 stamps · Minimum met". The reserve copy is the
// longest it can get, kept hidden in the same spot, so a recording that
// adds "Minimum met" never wraps it onto a new line and grows the page.
function Count({ p, stamps, reserve = false }: { p: Progress; stamps: number; reserve?: boolean }) {
  return (
    <p className={`activity__count${reserve ? ' activity__count--reserve' : ''}`} aria-hidden={reserve || undefined}>
      <span>
        <strong className="activity__tally">{countOf(p)}</strong>
        {p.activity === 'training' ? ' in person' : ''}
      </span>
      {p.activity === 'training' && <span>{plural(stamps, 'stamp')}</span>}
      {p.met && <span>Minimum met</span>}
    </p>
  )
}

export function ActivityPage({ page, activity, rep, stats, ctx, landing, onLanded, onOpen, still }: Props) {
  const reduced = useReducedMotion()
  const [open, setOpen] = useState(false)
  const p = stats.progress[activity]
  const slots = SLOTS[activity]

  // Today's stamp, once the demo has recorded one here. Stamps are in date
  // order and nothing is dated after today, so it's always the last one.
  const last = p.stamps.at(-1)
  const today = last && last.date === ctx.today ? last : null
  // A stamp that hasn't landed yet stays off the paper while it's moving
  // (and off the hidden sizer copy), so the page looks the way it did before
  // recording. The stamper is the only thing that ever inks it.
  const waiting = landing && still && today !== null
  const stamps = waiting ? p.stamps.slice(0, -1) : p.stamps
  const extras = stamps.slice(slots)
  // The moment only plays on the real page, never on the hidden sizer copy
  // or a page mid-turn.
  const playing = landing && !still && today !== null
  const inList = playing && p.stamps.length > slots
  // The count, as it was before today's stamp while that one is waiting.
  const shown = waiting ? before(p, today) : p
  const note = today && !waiting ? endorsement(today, stats) : null
  const ink = today ? stampLook(activity, today.supplier, rep.email, today.id).ink : 1

  // Let the moment run, then tell the app the stamp has landed so it won't
  // replay. Under reduced motion there's nothing to wait for.
  useEffect(() => {
    if (!playing) return
    if (reduced) {
      onLanded()
      return
    }
    const started = performance.now()
    let done = false
    const timer = window.setTimeout(() => {
      done = true
      onLanded()
    }, MOMENT_MS)
    return () => {
      window.clearTimeout(timer)
      // Turning away once the ink is down still counts, so coming back
      // doesn't bring the stamper down a second time.
      if (!done && performance.now() - started >= INK_MS) onLanded()
    }
  }, [playing, reduced, onLanded])

  // A full page has no slot for today's stamp, so it lands in the list. The
  // list stays shut and its summary flashes in the stamp's ink instead:
  // opening it on its own would make the book grow, and recording never
  // should. The endorsement under it says what landed.

  const more = activity === 'hub' ? 'Also finished' : 'Also attended'

  return (
    <Page kind="visa" label={ACTIVITY_NAMES[activity]} folio={page} runningHead="Stamps" className={playing && !inList ? 'is-thumping' : undefined}>
      <div className="activity__head">
        <h2 className="visa__title">{ACTIVITY_NAMES[activity]}</h2>
        {/* Trainings count in-person sessions toward the minimum, so a page
            full of virtual stamps still reads short of it. */}
        <div className="activity__count-room">
          <Count p={{ ...shown, counted: shown.minimum, met: true }} stamps={Math.max(stamps.length + 1, 10)} reserve />
          <Count p={shown} stamps={stamps.length} />
        </div>
      </div>

      <ul className="visa__grid">
        {Array.from({ length: slots }, (_, i) => {
          const stamp = stamps[i] ?? null
          return (
            <li key={stamp?.id ?? `empty-${i}`}>
              <StampSlot stamp={stamp} repEmail={rep.email} landing={playing && stamp === today} onOpen={onOpen} focusable={!still} />
            </li>
          )
        })}
      </ul>

      {extras.length > 0 && (
        <details className="activity__more" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
          <summary className={`activity__summary${inList ? ` is-new activity__summary--ink-${ink}` : ''}`} tabIndex={still ? -1 : undefined}>
            {more} <span className="activity__more-count">{extras.length}</span>
          </summary>
          <ul className="activity__extras">
            {extras.map((stamp) => (
              <li key={stamp.id}>
                <ExtraRow stamp={stamp} repEmail={rep.email} isNew={inList && stamp === today} onOpen={onOpen} focusable={!still} />
              </li>
            ))}
          </ul>
        </details>
      )}
      {/* A page that's exactly full keeps room for the summary, since the
          next stamp starts the list and the book shouldn't grow when it does. */}
      {extras.length === 0 && stamps.length === slots && (
        <p className="activity__summary activity__summary--reserve" aria-hidden="true">
          {more} <span className="activity__more-count">1</span>
        </p>
      )}

      {/* The endorsement, in today's stamp's ink, over the room kept for the
          longest one this page could get. */}
      <div className="activity__endorse">
        <p className="visa__reserve" aria-hidden="true">
          {longestEndorsement(activity, stats, ctx)}
        </p>
        {note && (
          <p className={`visa__endorse visa__endorse--ink-${ink}${playing ? ' is-writing' : ''}`} role="status">
            {note}
          </p>
        )}
      </div>
    </Page>
  )
}
