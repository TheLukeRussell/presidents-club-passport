// Page 7: the President’s Club checklist. All five minimums in one place,
// each a row that turns to its own page, with a tick once it's met. When
// the fifth one lands, a big QUALIFIED entry stamp goes on the page.

import { useState } from 'react'
import { ACTIVITIES, ACTIVITY_NAMES, CLUB_EXPRESS, MINIMUMS, PROGRAM_YEAR, type Activity } from '../../config'
import { pageForActivity } from '../../lib/book'
import { stampDate } from '../../lib/format'
import { lineMessage, progressLabel, quotaWhen } from '../../lib/messages'
import type { Rep } from '../../lib/model'
import type { Context, Progress, RepStats } from '../../lib/rules'
import { Page } from './Page'
import './VisaPage.css'
import './ChecklistPage.css'

interface Props {
  rep: Rep
  stats: RepStats
  ctx: Context
  onGo: (page: number) => void
  still: boolean
  // The quota seal is being pressed on the page beside this one (a spread).
  holdQuota: boolean
}

// What each minimum takes, under its name.
function takes(activity: Activity): string {
  const n = MINIMUMS[activity]
  switch (activity) {
    case 'training':
      return `${n} in person, any supplier`
    case 'fair':
      return `${n} supplier fairs`
    case 'hub':
      return `${n} supplier courses on the Hub`
    case 'club':
      return n === CLUB_EXPRESS.length ? `Both, ${CLUB_EXPRESS.map((e) => e.title.replace('Club Express ', '')).join(' and ')}` : `${n} events`
    case 'quota':
      return 'Hit it for the gold seal'
  }
}

// "June 30" stays on one line.
const keepDate = (text: string) => text.replace(/ (\d+)$/, '\u00a0$1')

// "3 of 4 in person" may wrap, but only between the count and "in person".
const keepTogether = (text: string) => text.replace(/(\d) of (\d)/, '$1\u00a0of\u00a0$2').replace('in person', 'in\u00a0person')

// The day the last minimum was met: the latest of the days each one got its
// final counting stamp. That's the date on the QUALIFIED stamp.
function qualifiedOn(stats: RepStats): string {
  return ACTIVITIES.map((a) => {
    const p = stats.progress[a]
    const counting = a === 'training' ? p.stamps.filter((s) => s.format === 'in person') : p.stamps
    return counting[p.minimum - 1]?.date ?? ''
  }).reduce((latest, date) => (date > latest ? date : latest), '')
}

export function ChecklistPage({ stats, ctx, onGo, still, holdQuota }: Props) {
  // While the gold seal is being pressed on page 8 beside it, this page shows
  // quota as it was, so the tick and the QUALIFIED stamp don't give the
  // moment away before the seal lifts.
  const holding = stats.progress.quota.met && holdQuota
  const shownMet = (p: Progress) => p.met && !(holding && p.activity === 'quota')
  const qualified = stats.qualified && !holding

  // The stamp comes down once, the moment the seal lifts. Turn to the page
  // later and it's simply there.
  const [wasHolding, setWasHolding] = useState(holding)
  const [lands, setLands] = useState(false)
  if (wasHolding !== holding) {
    setWasHolding(holding)
    if (wasHolding) setLands(true)
  }
  const stampLands = qualified && lands && !still

  const met = ACTIVITIES.filter((a) => shownMet(stats.progress[a])).length
  const message = lineMessage(stats, ctx)
  let note: { head?: string; sub: string } | null = null
  if (stats.outOfReach.length) note = message
  else if (!qualified && stats.activitiesDone) note = { head: 'On track', sub: `All four activities done. ${keepDate(quotaWhen())}.` }
  else if (!qualified) note = { sub: `Meet all five to qualify. ${keepDate(quotaWhen())}.` }

  return (
    <Page kind="visa" label="President’s Club checklist" folio={7} className="checklist">
      <header className="checklist__head">
        <h2 className="checklist__title">President’s Club {PROGRAM_YEAR}</h2>
        <p className="checklist__count">
          {met} of {ACTIVITIES.length} met
        </p>
      </header>

      <ul className="checklist__list">
        {ACTIVITIES.map((activity) => {
          const p = stats.progress[activity]
          const done = shownMet(p)
          const lost = !done && !p.reachable
          const progress = done || !holding || activity !== 'quota' ? progressLabel(p) : 'Not yet'
          const page = pageForActivity(activity)
          // Quota's progress already says Achieved, so it skips the ", met".
          const state = done ? (activity === 'quota' ? '' : ', met') : lost ? ', out of reach' : ''
          return (
            <li key={activity}>
              <button
                type="button"
                className={`checklist__row${done ? ' is-met' : ''}${lost ? ' is-lost' : ''}`}
                onClick={() => onGo(page)}
                tabIndex={still ? -1 : undefined}
                aria-label={`${ACTIVITY_NAMES[activity]}: ${progress}${state}. Go to page ${page}`}
              >
                <span className="checklist__tick" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    {done ? <path d="m6.5 12.5 3.5 3.5 7.5-8" /> : lost ? <path d="m8 8 8 8m0-8-8 8" /> : null}
                  </svg>
                </span>
                <span className="checklist__what">
                  <span className="checklist__name">{ACTIVITY_NAMES[activity]}</span>
                  <span className="checklist__takes">{takes(activity)}</span>
                </span>
                <span className="checklist__progress">{keepTogether(progress)}</span>
                <svg className="checklist__go" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="m9 5 7 7-7 7" />
                </svg>
              </button>
            </li>
          )
        })}
      </ul>

      {/* The note and the stamp share one cell, so the stamp's room is
          always kept and qualifying never makes the book grow. */}
      <div className="checklist__foot">
        {note && (
          <div className={`checklist__note${stats.outOfReach.length ? ' is-lost' : ''}`}>
            {note.head && <p className="checklist__note-head">{note.head}</p>}
            <p>{note.sub}</p>
          </div>
        )}
        <svg
          className={`checklist__stamp${qualified ? '' : ' is-waiting'}${stampLands ? ' is-landing' : ''}`}
          viewBox="0 0 300 124"
          role={qualified ? 'img' : undefined}
          aria-label={qualified ? `Qualified for President’s Club ${PROGRAM_YEAR}, ${stampDate(qualifiedOn(stats))}` : undefined}
          aria-hidden={qualified ? undefined : true}
        >
          <rect x={4} y={4} width={292} height={116} rx={6} className="checklist__stamp-heavy" />
          <rect x={12} y={12} width={276} height={100} rx={3} className="checklist__stamp-light" />
          <text x={150} y={36} textAnchor="middle" className="checklist__stamp-small" textLength={200} lengthAdjust="spacingAndGlyphs">
            {`PRESIDENT’S CLUB ${PROGRAM_YEAR}`}
          </text>
          <text x={150} y={80} textAnchor="middle" className="checklist__stamp-big" textLength={248} lengthAdjust="spacingAndGlyphs">
            QUALIFIED
          </text>
          <text x={150} y={102} textAnchor="middle" className="checklist__stamp-small">
            {qualified ? stampDate(qualifiedOn(stats)) : stampDate(ctx.today)}
          </text>
        </svg>
      </div>
    </Page>
  )
}
