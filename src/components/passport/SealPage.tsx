// Page 8: the quota seal, like the foot of a certificate. Before results
// land it's a blind ring and a line saying when. Once quota is hit it's the
// big gold seal, who it was awarded to and when, and an endorsement. When
// the demo records quota, a brass seal press comes down and the seal is there
// as it lifts.

import { useEffect, useRef } from 'react'
import { longDate } from '../../lib/format'
import { endorsement, quotaWhen } from '../../lib/messages'
import type { Rep, Stamp } from '../../lib/model'
import type { Context, RepStats } from '../../lib/rules'
import { useReducedMotion } from '../../state/useMedia'
import { GoldSeal } from './GoldSeal'
import { Page } from './Page'
import './VisaPage.css'
import './SealPage.css'

interface Props {
  rep: Rep
  stats: RepStats
  ctx: Context
  landing: boolean
  onLanded: () => void
  still: boolean
}

// How long the whole moment runs: the press's trip (--dur-press, 1400ms)
// with the endorsement writing itself in from 80% of the way, 620ms.
const MOMENT_MS = 1900
// When the seal shows: as the press lifts, 64% of --dur-press.
const SEALED_MS = 900
// Room above the seal for the press coming down, so it's on screen too.
const PRESS_ROOM = 120
// A little air between the endorsement and the sticky page bar.
const BAR_GAP = 8

export function SealPage({ rep, stats, ctx, landing, onLanded, still }: Props) {
  const reduced = useReducedMotion()
  const spot = useRef<HTMLDivElement>(null)
  const quota = stats.progress.quota
  const seal: Stamp | undefined = quota.stamps[0]
  // A seal that hasn't been pressed yet stays off the paper while it's
  // moving (and off the hidden sizer copy). The press is the only thing that
  // ever puts it there.
  const waiting = landing && still && Boolean(seal)
  const sealed = Boolean(seal) && !waiting
  // The moment only plays on the real page, never on the sizer or mid-turn.
  const playing = landing && !still && Boolean(seal)

  // The endorsement, and the longest one it could be, which keeps its room
  // whether it's written yet or not, so sealing never grows the book.
  const note = seal && sealed ? endorsement(seal, stats) : null
  const longest = endorsement(seal ?? { id: 'quota', email: rep.email, activity: 'quota', event: '', supplier: '', date: ctx.today, format: '', location: '' }, { ...stats, qualified: true })

  // Let the moment run, then tell the app the seal is in so it won't replay.
  // Under reduced motion there's nothing to wait for.
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
      // Turning away once the seal is down still counts, so coming back
      // doesn't bring the press down a second time.
      if (!done && performance.now() - started >= SEALED_MS) onLanded()
    }
  }, [playing, reduced, onLanded])

  // Bring the seal on screen for the moment, with room above it for the
  // press and the endorsement clear of the sticky page bar. A jump, and only
  // when it's needed.
  useEffect(() => {
    const el = spot.current
    if (!playing || !el) return
    const box = el.getBoundingClientRect()
    const bar = document.querySelector('.passport__controls')
    const floor = Math.min(window.innerHeight, bar && getComputedStyle(bar).position === 'sticky' ? bar.getBoundingClientRect().top - BAR_GAP : Infinity)
    const top = box.top - PRESS_ROOM
    if (top >= 0 && box.bottom <= floor) return
    if (box.bottom - top <= floor) window.scrollBy(0, top < 0 ? top : box.bottom - floor)
    else el.scrollIntoView({ block: 'center' })
  }, [playing])

  // "June 30" stays on one line.
  const before = quota.reachable ? `${quotaWhen().replace(/ (\d+)$/, '\u00a0$1')}. Your seal goes here.` : 'The year closed before quota was hit.'

  return (
    <Page kind="visa" label="Quota seal" folio={8} className={`seal-page${sealed ? ' is-sealed' : ''}${playing ? ' is-pressing' : ''}`}>
      <h2 className="seal-page__title">Sales growth quota</h2>

      <div className="seal-page__spot" ref={spot}>
        {(!sealed || playing) && <GoldSeal size="large" blind className="seal-page__blind" />}
        {sealed && <GoldSeal size="large" label={`Gold seal, ${rep.name}’s quota achieved`} className="seal-page__seal" />}
        {playing && <SealPress />}
      </div>

      {/* Before and after share one cell, so the page is the same height
          either way. */}
      <div className="seal-page__words">
        <p className="seal-page__before" aria-hidden={sealed ? true : undefined}>
          {before}
        </p>
        <div className="seal-page__after" aria-hidden={sealed ? undefined : true}>
          <p className="seal-page__awarded">Awarded to</p>
          <p className="seal-page__name">{rep.name}</p>
          <p className="seal-page__date">{longDate(seal?.date ?? ctx.today)}</p>
        </div>
      </div>

      {/* The endorsement, like an officer's note under the seal, written in
          once the press has lifted. */}
      <div className="seal-page__endorse-room">
        {note && (
          <p className={`seal-page__endorse${playing ? ' is-writing' : ''}`} role="status">
            {note}
          </p>
        )}
        <p className="seal-page__endorse seal-page__endorse--reserve" aria-hidden="true">
          {longest}
        </p>
      </div>
    </Page>
  )
}

// The brass seal press that comes down on the seal. Only on screen for about
// a second and a half: it swings in, hovers, presses hard, holds while the
// foil takes, and lifts away. Flat shapes in the app's own colours: a dark
// turned handle like the stamper's, and a brass die in the foil golds.
function SealPress() {
  return (
    <div className="seal-press" aria-hidden="true">
      <span className="seal-press__shadow" />
      <svg className="seal-press__tool" viewBox="0 0 200 210">
        <circle cx={100} cy={30} r={26} className="seal-press__knob" />
        <circle cx={91} cy={21} r={8} className="seal-press__knob-shine" />
        <path d="M86 52h28l6 70H80Z" className="seal-press__neck" />
        <rect x={64} y={118} width={72} height={18} rx={4} className="seal-press__collar" />
        <rect x={8} y={134} width={184} height={60} rx={10} className="seal-press__die" />
        <rect x={16} y={139} width={168} height={5} rx={2.5} className="seal-press__die-shine" />
        <rect x={12} y={192} width={176} height={14} rx={3} className="seal-press__face" />
      </svg>
    </div>
  )
}
