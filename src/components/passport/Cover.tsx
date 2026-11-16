// The passport cover, laid out like a real one: the issuer across the top,
// the year where the crest would be, PASSPORT under it, then whose it is.
// Gold foil on navy leather. Once quota is in, a small gold seal is pressed
// in under the year; until then a blind ring marks the spot. The whole cover
// is the button that opens it.

import { FISCAL_YEAR, PROGRAM_YEAR } from '../../config'
import type { Rep } from '../../lib/model'
import { ChipMark } from './ChipMark'
import { GoldSeal } from './GoldSeal'
import './Page.css'
import './Cover.css'

interface Props {
  rep: Rep
  // The quota's gold seal is in, so the cover carries it too.
  sealed: boolean
  onOpen: () => void
  still: boolean
}

export function Cover({ rep, sealed, onOpen, still }: Props) {
  return (
    <section className={`page cover${sealed ? ' is-sealed' : ''}`} aria-label={`Cover of ${rep.name}’s passport`}>
      <p className="cover__program foil">President’s Club</p>
      <div className="cover__crest">
        <p className="cover__year foil">{PROGRAM_YEAR}</p>
        <GoldSeal size="small" blind={!sealed} label={sealed ? 'Gold seal, quota achieved' : undefined} className="cover__seal" />
      </div>
      <div className="cover__titles">
        <p className="cover__title foil">Passport</p>
        <p className="cover__sub foil">{FISCAL_YEAR} Qualifications</p>
      </div>
      <div className="cover__holder">
        <p className="cover__name">{rep.name}</p>
        <p className="cover__team">{rep.team} team</p>
      </div>
      <div className="cover__foot">
        <button type="button" className="cover__open" onClick={onOpen} tabIndex={still ? -1 : 0}>
          Open passport
        </button>
        <ChipMark />
      </div>
    </section>
  )
}
