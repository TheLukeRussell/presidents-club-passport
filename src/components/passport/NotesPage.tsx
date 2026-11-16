// The inside cover: the five President’s Club minimums, how stamps count
// toward them, and a key to what's on the pages. It's laminated like the data
// page, so the first spread catches the light on both sides.

import { ACTIVITIES, ACTIVITY_NAMES, CLUB_EXPRESS, MINIMUMS, PROGRAM_YEAR, QUOTA_DATE, type Activity } from '../../config'
import { longDate } from '../../lib/format'
import { GoldSeal } from './GoldSeal'
import { Laminate } from './Laminate'
import { Page } from './Page'
import './NotesPage.css'

// "June 30", when quota results come in.
const QUOTA_DAY = longDate(QUOTA_DATE).replace(/, \d{4}$/, '').replace(' ', '\u00a0')

// What each minimum asks for, in a word or two, straight from config.
function minimum(activity: Activity): string {
  const n = MINIMUMS[activity]
  switch (activity) {
    case 'training':
      return `${n} in person`
    case 'hub':
      return `${n} courses`
    case 'club':
      return n === CLUB_EXPRESS.length ? 'Both events' : `${n} events`
    case 'quota':
      return 'Hit it'
    default:
      return String(n)
  }
}

export function NotesPage() {
  return (
    <Page kind="notes" label="Inside cover" folio={1}>
      <Laminate>
        <h2 className="notes__title">How your passport works</h2>
        <p className="notes__lead">
          Meet all five minimums to qualify for President’s Club {PROGRAM_YEAR}.
        </p>
        <dl className="notes__minimums">
          {ACTIVITIES.map((activity) => (
            <div key={activity}>
              <dt>{ACTIVITY_NAMES[activity]}</dt>
              <dd>{minimum(activity)}</dd>
            </div>
          ))}
        </dl>
        <ul className="notes__rules">
          <li>Every supplier training earns a stamp. Only in-person ones count toward the {MINIMUMS.training}.</li>
          <li>Extras go in a list under the stamps.</li>
          <li>Quota is the gold seal. Results land {QUOTA_DAY}.</li>
          <li>All five earns the seal on your cover.</li>
        </ul>

        {/* The swatches are pictures, so they're hidden from screen readers
            and each one's name goes in front of its words instead. */}
        <div className="notes__key">
          <p className="notes__key-title">On the pages</p>
          <ul className="notes__key-list">
            <li>
              <span className="notes__swatch notes__swatch--stamp" aria-hidden="true">
                Stamped
              </span>
              <span>
                <span className="visually-hidden">Stamped: </span>You were there
              </span>
            </li>
            <li>
              <span className="notes__swatch notes__swatch--needed" aria-hidden="true">
                Still needed
              </span>
              <span>
                <span className="visually-hidden">Still needed: </span>Not yet
              </span>
            </li>
            <li>
              <span className="notes__swatch notes__swatch--seal" aria-hidden="true">
                <GoldSeal size="small" />
              </span>
              <span>
                <span className="visually-hidden">Gold seal: </span>Quota hit
              </span>
            </li>
          </ul>
        </div>
      </Laminate>
    </Page>
  )
}
