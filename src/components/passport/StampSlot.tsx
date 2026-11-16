// One slot on an activity page. A stamp the rep earned is a button that
// opens its detail slip. A slot still to fill is a dashed outline that says
// so, with no event or date: the passport only shows what a rep has done.
// Also the compact row a stamp gets in the Also attended list.

import type { Stamp as StampData } from '../../lib/model'
import { longDate, shortDate } from '../../lib/format'
import { stampLook } from '../../lib/stamps'
import { Stamp } from './Stamp'
import { Stamper } from './Stamper'
import './StampSlot.css'

interface Props {
  stamp: StampData | null // null for a slot that's still needed
  repEmail: string
  // True while today's stamp is coming down on this slot.
  landing: boolean
  onOpen: (stamp: StampData) => void
  focusable: boolean
}

// The small line under a stamp: how a training was held, where a fair or
// Club Express was, and that a Hub course is done online.
function stampCaption(stamp: StampData): string {
  switch (stamp.activity) {
    case 'training':
      return stamp.format === 'virtual' ? 'Virtual' : 'In person'
    case 'hub':
      return 'Online course'
    default:
      return stamp.location || 'In person'
  }
}

// What a stamp is called in a list or a button name.
function stampName(stamp: StampData): string {
  if (stamp.activity === 'hub') return `${stamp.supplier} Hub course, ${stamp.event}`
  return stamp.event || stamp.supplier
}

// The button's name: what it was, when, how or where, then what it does.
// "Zebra solutions workshop, September 23, 2026, in person. Show details"
function stampLabel(stamp: StampData): string {
  const caption = stampCaption(stamp)
  const how = stamp.activity === 'training' ? caption.toLowerCase() : stamp.activity === 'hub' ? 'online' : caption
  return `${stampName(stamp)}, ${longDate(stamp.date)}, ${how}. Show details`
}

// An empty stamp's worth of room, so a slot is the same size stamped or not
// and recording never makes the page grow.
const ROOM = (
  <span className="slot__stamp slot__room" aria-hidden="true">
    <svg className="stamp" viewBox="0 0 140 110" />
  </span>
)

export function StampSlot({ stamp, repEmail, landing, onOpen, focusable }: Props) {
  if (!stamp) {
    return (
      <div className="slot slot--empty">
        {ROOM}
        {/* A blank caption line, so it lines up with a stamped slot. */}
        <span className="slot__caption" aria-hidden="true">
          {'\u00a0'}
        </span>
        <span className="slot__needed">Still needed</span>
      </div>
    )
  }
  // The stamper uses the same ink and lands at the same tilt as the stamp.
  const look = stampLook(stamp.activity, stamp.supplier, repEmail, stamp.id)
  return (
    <button
      type="button"
      className={`slot slot--stamped${landing ? ' is-landing' : ''}`}
      onClick={() => onOpen(stamp)}
      aria-label={stampLabel(stamp)}
      tabIndex={focusable ? 0 : -1}
      data-stamp={stamp.id}
    >
      <span className="slot__stamp">
        <Stamp stamp={stamp} repEmail={repEmail} landing={landing} />
        {landing && <Stamper ink={look.ink} tilt={look.rotate} />}
      </span>
      <span className="slot__caption">{stampCaption(stamp)}</span>
    </button>
  )
}

interface RowProps {
  stamp: StampData
  repEmail: string
  // True while today's stamp lands in the list instead of a slot.
  isNew: boolean
  onOpen: (stamp: StampData) => void
  focusable: boolean
}

// Sep 23, 2026
const rowDate = (date: string) => `${shortDate(date).split(', ')[1]}, ${date.slice(0, 4)}`

// One stamp past the slots: its name, then the date and how or where.
export function ExtraRow({ stamp, repEmail, isNew, onOpen, focusable }: RowProps) {
  const { ink } = stampLook(stamp.activity, stamp.supplier, repEmail, stamp.id)
  const named = stamp.activity === 'training' || stamp.activity === 'hub'
  const caption = stampCaption(stamp)
  const detail = stamp.activity === 'training' ? caption.toLowerCase() : stamp.activity === 'hub' ? stamp.event : caption
  return (
    <button
      type="button"
      className={`extra extra--ink-${ink}${isNew ? ' is-new' : ''}`}
      onClick={() => onOpen(stamp)}
      aria-label={stampLabel(stamp)}
      tabIndex={focusable ? 0 : -1}
      data-stamp={stamp.id}
    >
      <span className="extra__name">{named ? stamp.supplier || stamp.event : stamp.event}</span>
      <span className="extra__meta">
        {rowDate(stamp.date)}, {detail}
      </span>
    </button>
  )
}
