// The data page: who the passport belongs to, how many of the five minimums
// they've met, their rank, where quota stands, what's left, and the
// machine-readable strip.

import { ACTIVITIES, EXPIRY_DATE, ISSUE_DATE, QUOTA_DATE } from '../../config'
import { givenNames, initials, longDate, ordinal, stampDate, surname } from '../../lib/format'
import { lineMessage } from '../../lib/messages'
import { mrzLines } from '../../lib/mrz'
import type { Rep } from '../../lib/model'
import type { StandingRow } from '../../lib/ranking'
import type { Context } from '../../lib/rules'
import { GoldSeal } from './GoldSeal'
import { Laminate } from './Laminate'
import { Page } from './Page'
import './DataPage.css'

interface Props {
  rep: Rep
  row: StandingRow
  repCount: number
  ctx: Context
}

// "June 30", when quota results come in.
const QUOTA_DAY = longDate(QUOTA_DATE).replace(/, \d{4}$/, '').replace(' ', '\u00a0')

// The widest ranks this board can show: one for each ordinal ending (st, nd,
// rd, th) at the most digits. Kept hidden under the real rank, so a new
// ordinal or a tie never rewraps the cell and grows the book.
function widestRanks(repCount: number): number[] {
  const floor = 10 ** (String(repCount).length - 1)
  const byEnding = new Map<string, number>()
  for (let n = repCount; n >= floor && byEnding.size < 4; n--) {
    const ending = ordinal(n).slice(-2)
    if (!byEnding.has(ending)) byEnding.set(ending, n)
  }
  return [...byEnding.values()]
}

// "53rd of 60, tied", with the number in display type.
function RankText({ rank, of, tied }: { rank: number; of: number; tied: boolean }) {
  return (
    <span className="data__figure">
      {ordinal(rank)}
      <span className="data__of">
        {' '}
        of {of}
        {tied ? ', tied' : ''}
      </span>
    </span>
  )
}

export function DataPage({ rep, row, repCount, ctx }: Props) {
  const { stats, rank, status } = row
  const message = lineMessage(stats, ctx)
  // Where every recording ends up. Two lines of each on a phone, longer
  // than most reps' messages before it.
  const qualified = lineMessage({ ...stats, qualified: true }, ctx)
  const quota = stats.progress.quota
  const [mrz1, mrz2] = mrzLines({
    name: rep.name,
    team: rep.team,
    met: stats.met,
    stamps: stats.total,
    quota: quota.met,
    rank,
    issue: ISSUE_DATE,
    expiry: EXPIRY_DATE,
  })

  return (
    <Page kind="data" label="Data page" folio={2}>
      {/* Everything above the strip, what ICAO calls the visual inspection
          zone. It lays out just like the page body, and it's the box the
          laminate covers, so the film stops short of the strip and the
          page number. */}
      <Laminate>
        <header className="data__head">
          <h2 className="data__title">Passport</h2>
          <dl className="data__codes">
            <div>
              <dt>Type</dt>
              <dd>P</dd>
            </div>
            <div>
              <dt>Code</dt>
              <dd>PCP</dd>
            </div>
          </dl>
        </header>

        {/* Names sit beside the photo box like a real bio page. Everything else
            runs the full width underneath so IDs and dates never squeeze. */}
        <div className="data__bio">
          <div className="data__photo" aria-hidden="true">
            {initials(rep.name)}
          </div>
          <dl className="data__names">
            <div className="data__field">
              <dt>Surname</dt>
              <dd className="data__name">{surname(rep.name)}</dd>
            </div>
            <div className="data__field">
              <dt>Given names</dt>
              <dd className="data__name">{givenNames(rep.name)}</dd>
            </div>
          </dl>
        </div>
        <dl className="data__fields">
          <div className="data__field">
            <dt>Team</dt>
            <dd className="data__team">{rep.team}</dd>
          </div>
          <div className="data__field">
            <dt>Rep ID</dt>
            <dd className="data__id">{rep.id}</dd>
          </div>
          <div className="data__field">
            <dt>Date of issue</dt>
            <dd className="data__date">{stampDate(ISSUE_DATE)}</dd>
          </div>
          <div className="data__field">
            <dt>Date of expiry</dt>
            <dd className="data__date">{stampDate(EXPIRY_DATE)}</dd>
          </div>
        </dl>

        <dl className="data__stats">
          <div className="data__stat">
            <dt>Minimums met</dt>
            <dd>
              <span className="data__figure">
                {stats.met}
                <span className="data__of"> of {ACTIVITIES.length}</span>
              </span>
            </dd>
          </div>
          <div className="data__stat">
            <dt>Stamps</dt>
            <dd>
              <span className={`data__figure${stats.total === 0 ? ' data__figure--word' : ''}`}>{stats.total === 0 ? 'None yet' : stats.total}</span>
            </dd>
          </div>
          <div className="data__stat">
            <dt>Rank</dt>
            <dd className="data__rank">
              <span>
                <RankText rank={rank} of={repCount} tied={row.tied} />
              </span>
              {widestRanks(repCount).map((n) => (
                <span key={n} className="data__rank-reserve" aria-hidden="true">
                  <RankText rank={n} of={repCount} tied />
                </span>
              ))}
            </dd>
          </div>
          {/* Quota: when the results come in, then the gold seal once it's hit. */}
          <div className="data__stat">
            <dt>Quota</dt>
            <dd className={`data__quota${quota.met ? ' is-met' : ''}`}>
              {quota.met ? (
                <>
                  <GoldSeal size="small" />
                  <span className="data__quota-head">Achieved</span>
                  <span className="data__quota-sub">{stampDate(quota.stamps[0].date)}</span>
                </>
              ) : (
                <>
                  <span className="data__quota-head">{quota.reachable ? 'Results due' : 'Not hit'}</span>
                  <span className="data__quota-sub">{QUOTA_DAY}</span>
                </>
              )}
            </dd>
          </div>
        </dl>

        {/* Where they stand, in one of four looks: gold on navy leather once
            they've qualified, Ember on Charcoal when only quota is left, plain
            Charcoal with work to do, and a red outline when it's out of reach.
            The qualified message's room is kept hidden in the same cell, so
            qualifying never makes the book grow. */}
        <div className="data__line-room">
          <div className={`data__line data__line--${status}`} role="status">
            <p className="data__line-head">{message.head}</p>
            <p className="data__line-sub">{message.sub}</p>
          </div>
          <div className="data__line data__line--reserve" aria-hidden="true">
            <p className="data__line-head">{qualified.head}</p>
            <p className="data__line-sub">{qualified.sub}</p>
          </div>
        </div>
      </Laminate>

      {/* Two lines of 44 on a wide page. On a phone the spans run inline and
          break anywhere, so the strip wraps to three lines and stays 16px. */}
      {/* role="img" so screen readers use the label instead of reading out
          88 characters of chevrons. */}
      <p className="data__mrz" role="img" aria-label={`Machine-readable zone for ${rep.name}`}>
        <span>{mrz1}</span>
        <span>{mrz2}</span>
      </p>
    </Page>
  )
}
