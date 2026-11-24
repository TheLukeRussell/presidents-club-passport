// Details for one stamp, opened by tapping it: what it was, when and where,
// how many reps share it, and what it counts toward. A native <dialog>, so
// focus, Escape and the backdrop come for free, and you never leave the page.

import { useEffect, useRef } from 'react'
import { MINIMUMS, type Activity } from '../../config'
import { firstName, longDate, plural } from '../../lib/format'
import { stampsOf, type Model, type Rep, type Stamp } from '../../lib/model'
import './StampDetail.css'

interface Props {
  stamp: Stamp | null
  model: Model
  rep: Rep
  // How many reps share it, and the mention of Standings. Off in the live
  // passport, which only has your own stamps and no Standings.
  showReps: boolean
  onClose: () => void
}

const KINDS: Record<Activity, string> = {
  training: 'Supplier training',
  fair: 'Supplier fair',
  hub: 'Hub course',
  club: 'Club Express',
  quota: 'Sales growth quota',
}

// What the minimum counts, for the status line.
const COUNTS: Record<Activity, string> = {
  training: 'in-person trainings',
  fair: 'supplier fairs',
  hub: 'Hub courses',
  club: 'Club Express events',
  quota: 'quota',
}

const squash = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, '')

// Everyone shares a fair's or a training's stamp. Hub courses are done on
// your own, on any day, so they match by course instead.
function sharedBy(model: Model, stamp: Stamp): number {
  const match =
    stamp.activity === 'hub'
      ? (s: Stamp) => s.activity === 'hub' && squash(s.event) === squash(stamp.event)
      : (s: Stamp) => s.id === stamp.id
  return new Set(model.stamps.filter(match).map((s) => s.email)).size
}

// A training with no format reads Virtual everywhere, since only an
// in-person one counts toward the minimum.
function formatAndPlace(stamp: Stamp): string {
  if (stamp.activity === 'hub') return 'Online, on the Hub'
  if (stamp.activity === 'training' && stamp.format !== 'in person') return 'Virtual'
  return stamp.location ? `In person, ${stamp.location}` : 'In person'
}

// One line on what this stamp counts toward. A virtual training still earns
// a stamp, and anything past the minimum still adds to the total that
// breaks ties on Standings (in the demo; the live passport has no
// Standings, so there it's just their total).
function statusOf(model: Model, rep: Rep, stamp: Stamp, standings: boolean): string {
  const { activity } = stamp
  if (activity === 'quota') return 'Quota hit, so the last minimum is met.'
  if (activity === 'training' && stamp.format !== 'in person') {
    return 'A virtual training earns a stamp, but the minimum counts in-person sessions only.'
  }
  const min = MINIMUMS[activity]
  const counted = stampsOf(model, rep).filter((s) => s.activity === activity && (activity !== 'training' || s.format === 'in person'))
  const place = counted.findIndex((s) => s.id === stamp.id)
  if (place >= min) {
    return `An extra: ${firstName(rep.name)} already had the ${min} ${COUNTS[activity]}. ${standings ? 'It still adds to the stamp total on Standings.' : 'It still adds to the stamp total.'}`
  }
  if (activity === 'training') return `In person, so it counts toward the ${min} in-person trainings.`
  if (activity === 'club') return 'Counts toward Club Express, which takes both events.'
  return `Counts toward the ${min} ${COUNTS[activity]}.`
}

export function StampDetail({ stamp, model, rep, showReps, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (stamp && !dialog.open) {
      dialog.showModal()
      // Start on the heading, not Close. On a short screen (200% zoom, a
      // phone on its side) focusing Close scrolled the slip past its title.
      dialog.querySelector<HTMLElement>('#slip-title')?.focus()
      dialog.scrollTop = 0
    }
    if (!stamp && dialog.open) dialog.close()
  }, [stamp])

  let title = ''
  let lead = ''
  let reps = ''
  if (stamp) {
    const named = stamp.activity === 'training' || stamp.activity === 'hub'
    title = named ? stamp.supplier || stamp.event : stamp.event
    lead = named && stamp.event !== title ? stamp.event : ''
    const n = sharedBy(model, stamp)
    if (stamp.activity === 'hub') reps = `Finished by ${plural(n, 'rep')}`
    else if (stamp.activity === 'quota') reps = `Hit by ${plural(n, 'rep')}`
    else reps = `${plural(n, 'rep')} ${n === 1 ? 'was' : 'were'} there`
  }

  return (
    <dialog
      ref={ref}
      className="slip"
      aria-labelledby="slip-title"
      onClose={onClose}
      // A click that lands on the dialog itself (not its contents) is a click
      // on the backdrop, so close. Not the second click of a double-click,
      // though: that's the same click that opened it, landing on the backdrop.
      onClick={(event) => {
        if (event.target === event.currentTarget && event.detail < 2) event.currentTarget.close()
      }}
    >
      {stamp && (
        <div className="slip__inner">
          <div className="slip__head">
            <h2 id="slip-title" className="slip__title" tabIndex={-1}>
              {title}
            </h2>
            {lead && <p className="slip__lead">{lead}</p>}
          </div>
          <dl className="slip__facts">
            <div>
              <dt>What</dt>
              <dd>{KINDS[stamp.activity]}</dd>
            </div>
            <div>
              <dt>Date</dt>
              <dd>{longDate(stamp.date)}</dd>
            </div>
            {stamp.activity !== 'quota' && (
              <div>
                <dt>Format</dt>
                <dd>{formatAndPlace(stamp)}</dd>
              </div>
            )}
            {showReps && (
              <div>
                <dt>Reps</dt>
                <dd>{reps}</dd>
              </div>
            )}
          </dl>
          <p className="slip__status">{statusOf(model, rep, stamp, showReps)}</p>
          <form method="dialog" className="slip__actions">
            <button type="submit" className="btn">
              Close
            </button>
          </form>
        </div>
      )}
    </dialog>
  )
}
