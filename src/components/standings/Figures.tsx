// The three figures at the top of Standings. All computed from the rows on
// screen, nothing typed in by hand.

import type { Figures as FigureValues } from '../../lib/ranking'
import './Figures.css'

interface Props {
  figures: FigureValues
  scope: string // "reps", or "NetSec reps" on a team filter
}

export function Figures({ figures, scope }: Props) {
  const done = figures.activitiesDone
  return (
    <dl className="figures">
      <div className="figures__item">
        <dt>Qualified</dt>
        <dd>
          <span className="figures__value">{figures.qualified}</span>
          <span className="figures__unit">
            {' '}
            of {figures.reps} {scope}
          </span>
        </dd>
      </div>
      {/* Everyone with the four activities in, qualified or still waiting on quota. */}
      <div className="figures__item">
        <dt>Activities done</dt>
        <dd>
          <span className="figures__value">{done}</span>
          <span className="figures__unit"> {done === 1 ? 'rep has' : 'reps have'} all four, quota or not</span>
        </dd>
      </div>
      <div className="figures__item">
        <dt>Average stamps</dt>
        <dd>
          <span className="figures__value">{figures.averageStamps === null ? 'None' : figures.averageStamps.toFixed(1)}</span>
          <span className="figures__unit"> per rep</span>
        </dd>
      </div>
    </dl>
  )
}
