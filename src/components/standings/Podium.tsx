// The podium: the top three, set apart. Ties keep their shared rank here
// too, so a two-way tie for second shows two 2s, not a 2 and a 3. A tie
// too big for the steps left gets one step that counts them and opens
// them on the board, instead of the alphabet picking who stands up there.

import { Link } from 'react-router'
import type { Span } from '../../lib/board'
import { DATA_PAGE } from '../../lib/book'
import { ordinal } from '../../lib/format'
import { podiumSteps, type TieStep } from '../../lib/podium'
import type { StandingRow } from '../../lib/ranking'
import { percentOf } from '../../lib/rules'
import './Podium.css'

interface Props {
  rows: StandingRow[]
  team: string | null
  onSeeAll: (span: Span) => void
}

// Visual order is 2nd, 1st, 3rd. Reading order stays 1st, 2nd, 3rd.
const PLACES = ['first', 'second', 'third'] as const

// Step height follows each step's place, not its slot: place is one plus
// how many reps on the podium rank strictly better. Two tied for second
// both stand on the second step, and a team's top three ranked 5, 5 and
// 14 overall get tall, tall and short.
const HEIGHTS = ['tall', 'mid', 'short'] as const

function TieContent({ step, team, onSeeAll }: { step: TieStep; team: string | null; onSeeAll: (span: Span) => void }) {
  const tiedFor = `${step.count} reps tied for ${ordinal(step.rank)}`
  return (
    <>
      <p className="podium__rank">
        <span className="visually-hidden">Rank </span>T{step.rank}
      </p>
      <p className="podium__count">{tiedFor}</p>
      {!team && <p className="podium__meta">{step.teams.length === 1 ? step.teams[0] : `From ${step.teams.length} teams`}</p>}
      <p className="podium__rate">
        {percentOf(step.rate)}%
        {step.stamps && (
          <span className="podium__stamps">
            {' '}
            {step.stamps.attended} of {step.stamps.recorded}
          </span>
        )}
      </p>
      {/* Like a rep's name, it covers the whole step. */}
      <button
        type="button"
        className="btn btn--quiet podium__all"
        aria-label={`See all ${tiedFor}`}
        onClick={() => onSeeAll({ start: step.start, end: step.end })}
      >
        See all {step.count}
      </button>
    </>
  )
}

export function Podium({ rows, team, onSeeAll }: Props) {
  const steps = podiumSteps(rows)
  const top = steps[0]
  const title = top?.kind === 'tie' && top.fills ? 'Tied at the top' : 'Top three'

  return (
    <div className="podium">
      {/* "Top three in Communications" reads better than "Communications’s". */}
      <h2 className="podium__title">{team ? `${title} in ${team}` : title}</h2>
      <ol className="podium__steps">
        {/* The T comes from the full board, so a team's podium marks the
            same ties the All board does. */}
        {steps.map((step, i) => {
          const height = HEIGHTS[step.place - 1]
          if (step.kind === 'tie') {
            // Alone it spans all three slots. Otherwise it takes its own.
            const slot = step.fills ? 'all' : PLACES[i]
            return (
              <li key="tie" className={`podium__step podium__step--tie podium__step--${slot} podium__step--${height}`}>
                <TieContent step={step} team={team} onSeeAll={onSeeAll} />
              </li>
            )
          }
          const { row } = step
          return (
            <li key={row.rep.id} className={`podium__step podium__step--${PLACES[i]} podium__step--${height}`}>
              <p className="podium__rank">
                <span className="visually-hidden">Rank </span>
                {row.tied ? 'T' : ''}
                {row.rank}
              </p>
              <Link className="podium__name" to={`/passport/${row.rep.id}?page=${DATA_PAGE}`}>
                {row.rep.name}
              </Link>
              {/* On a team filter the heading already says which team. */}
              {!team && <p className="podium__meta">{row.rep.team}</p>}
              <p className="podium__rate">
                {percentOf(row.stats.rate ?? 0)}%
                <span className="podium__stamps">
                  {' '}
                  {row.stats.attended} of {row.stats.recorded}
                </span>
              </p>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
