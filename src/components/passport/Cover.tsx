// The passport cover, laid out like a real one: the issuer across the top,
// the year where the crest would be, PASSPORT under it, then whose it is.
// Kept to those few lines on purpose; the team and the fiscal year live
// inside, on the data page.
// Gold foil on navy leather. Once all five minimums are met, the President's
// Club seal is pressed in under the year: the passport is complete. Until
// then a blind ring marks the spot. The whole cover is the button that opens it.

import { PROGRAM_YEAR } from '../../config'
import type { Rep } from '../../lib/model'
import { ChipMark } from './ChipMark'
import { GoldSeal } from './GoldSeal'
import './Page.css'
import './Cover.css'

interface Props {
  rep: Rep
  // All five minimums met, so the cover carries the President's Club seal.
  qualified: boolean
  onOpen: () => void
  still: boolean
}

export function Cover({ rep, qualified, onOpen, still }: Props) {
  return (
    <section className={`page cover${qualified ? ' is-sealed' : ''}`} aria-label={`Cover of ${rep.name}’s passport`}>
      <p className="cover__program foil">President’s Club</p>
      <div className="cover__crest">
        <p className="cover__year foil">{PROGRAM_YEAR}</p>
        <GoldSeal
          size="small"
          kind="club"
          blind={!qualified}
          label={qualified ? 'President’s Club seal: all five minimums met' : undefined}
          className="cover__seal"
        />
      </div>
      <p className="cover__title foil">Passport</p>
      <div className="cover__holder">
        <p className="cover__name">{rep.name}</p>
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
