// The back cover, so the book closes instead of just stopping on page 8.
// Navy leather with the ScanSource logo pressed in gold foil, like a maker's
// mark, one line of foil at the foot, and a way back to the front.

import type { CSSProperties } from 'react'
import { EXPIRY_DATE, FISCAL_YEAR, ISSUE_DATE } from '../../config'
import { stampDate } from '../../lib/format'
import type { Rep } from '../../lib/model'
import { ChipMark } from './ChipMark'
import './Page.css'
import './Cover.css'

interface Props {
  rep: Rep
  onFront: () => void
  still: boolean
}

// The supplied logo file, untouched. It's used as a stencil (a CSS mask) and
// the gold fills its shape, so the file itself never changes.
const LOGO = `url("${import.meta.env.BASE_URL}brand/scansource-logo.svg")`

export function BackCover({ rep, onFront, still }: Props) {
  return (
    <section className="page cover cover--back" aria-label={`Back cover of ${rep.name}’s passport`}>
      <span className="cover__mark cover__logo" role="img" aria-label="ScanSource" style={{ '--logo': LOGO } as CSSProperties} />
      <p className="cover__back-note foil">
        Valid for {FISCAL_YEAR}, <span className="cover__date">{stampDate(ISSUE_DATE)}</span> to{' '}
        <span className="cover__date">{stampDate(EXPIRY_DATE)}</span>.
      </p>
      <div className="cover__foot">
        <button type="button" className="cover__open" onClick={onFront} tabIndex={still ? -1 : 0}>
          Back to the front
        </button>
        <ChipMark />
      </div>
    </section>
  )
}
