// The "Passport of" picker: opens anyone's passport on the page you're on,
// so you can compare the same page of two passports, say their Supplier
// trainings. It only changes whose passport is open. Who you are (View as,
// in the demo panel) stays put.

import { useNavigate } from 'react-router'
import { TEAMS } from '../../config'
import type { Model, Rep } from '../../lib/model'
import './PassportPicker.css'

interface Props {
  model: Model
  rep: Rep
  // The page in the URL right now, 0 for the front cover.
  page: number
}

// Reps by team, A to Z, plus an Other group for anyone whose team in the
// sheet isn't one of the five, so every passport can be opened from here.
function teamGroups(reps: Rep[]): [string, Rep[]][] {
  const known: readonly string[] = TEAMS
  const byName = (list: Rep[]) => list.sort((a, b) => a.name.localeCompare(b.name))
  const groups: [string, Rep[]][] = TEAMS.map((team) => [team, byName(reps.filter((r) => r.team === team))])
  const other = byName(reps.filter((r) => !known.includes(r.team)))
  return other.length ? [...groups, ['Other', other]] : groups
}

export function PassportPicker({ model, rep, page }: Props) {
  const navigate = useNavigate()

  return (
    <div className="picker">
      <label htmlFor="passport-of" className="picker__label">
        Passport of
      </label>
      {/* The box carries the chevron, since a select can't draw its own. */}
      <span className="picker__box">
        <select
          id="passport-of"
          className="picker__select"
          value={rep.id}
          onChange={(event) => navigate(`/passport/${event.target.value}${page ? `?page=${page}` : ''}`)}
        >
          {teamGroups(model.reps).map(([team, reps]) => (
            <optgroup key={team} label={team}>
              {reps.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </span>
    </div>
  )
}
