// The passport cover, laid out like a real one: the issuer across the top,
// the year where the crest would be, PASSPORT under it, then whose it is.
// Kept to those few lines on purpose; the team and the fiscal year live
// inside, on the data page.
// Gold foil on navy leather. Once all five minimums are met, the President's
// Club seal is pressed in under the year: the passport is complete. Until
// then a blind ring marks the spot. The moment it's earned the cover
// celebrates: the seal drops in, gold bursts out from under it and the foil
// glints. The whole cover is the button that opens it.

import { useEffect } from 'react'
import { PROGRAM_YEAR } from '../../config'
import type { Rep } from '../../lib/model'
import { useReducedMotion } from '../../state/useMedia'
import { ChipMark } from './ChipMark'
import { GoldSeal } from './GoldSeal'
import { SealBurst } from './SealBurst'
import './Page.css'
import './Cover.css'

interface Props {
  rep: Rep
  // All five minimums met, so the cover carries the President's Club seal.
  qualified: boolean
  // The fifth minimum just landed: play the celebration, then say so.
  celebrating: boolean
  onCelebrated: () => void
  onOpen: () => void
  still: boolean
}

// How long the celebration runs: the seal's drop, the burst and the glint.
const CELEBRATE_MS = 2600
// With reduced motion nothing moves, but the announcement still needs a
// moment on screen before it goes.
const ANNOUNCE_MS = 1500

export function Cover({ rep, qualified, celebrating, onCelebrated, onOpen, still }: Props) {
  const reduced = useReducedMotion()

  useEffect(() => {
    if (!celebrating) return
    const timer = window.setTimeout(onCelebrated, reduced ? ANNOUNCE_MS : CELEBRATE_MS)
    return () => window.clearTimeout(timer)
  }, [celebrating, reduced, onCelebrated])

  return (
    <section className={`page cover${qualified ? ' is-sealed' : ''}${celebrating ? ' is-celebrating' : ''}`} aria-label={`Cover of ${rep.name}’s passport`}>
      <p className="cover__program foil">President’s Club</p>
      <div className="cover__crest">
        <p className="cover__year foil">{PROGRAM_YEAR}</p>
        <span className="cover__seal-spot">
          {/* The blind ring stays under the falling seal until it lands. */}
          {celebrating && <GoldSeal size="small" kind="club" blind className="cover__seal cover__seal--ring" />}
          {celebrating && !reduced && <SealBurst />}
          <GoldSeal
            size="small"
            kind="club"
            blind={!qualified}
            label={qualified ? 'President’s Club seal: all five minimums met' : undefined}
            className="cover__seal"
          />
        </span>
      </div>
      <p className="cover__title foil">Passport</p>
      <div className="cover__holder">
        <p className="cover__name">{rep.name}</p>
      </div>
      {/* Says what just happened, for anyone not watching the burst. */}
      <p className="visually-hidden" role="status">
        {celebrating ? `${rep.name} met all five minimums. The President’s Club seal is on the cover.` : ''}
      </p>
      <div className="cover__foot">
        <button type="button" className="cover__open" onClick={onOpen} tabIndex={still ? -1 : 0}>
          Open passport
        </button>
        <ChipMark />
      </div>
    </section>
  )
}
