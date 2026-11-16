// The Standings screen: three figures, the podium, and the board with the
// President's Club line drawn across it. Team filter and name search live in
// the URL (#/standings?team=netsec&q=kai) so a filtered view can be shared.

import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { BOARD, TEAMS } from '../../config'
import type { Span } from '../../lib/board'
import { figuresFor } from '../../lib/ranking'
import { useApp } from '../../state/AppState'
import { Board } from './Board'
import { Figures } from './Figures'
import { Podium } from './Podium'
import './StandingsScreen.css'

const NONE: Span[] = []

export function StandingsScreen() {
  const app = useApp()
  const { board, viewAs } = app.ready!
  const [params, setParams] = useSearchParams()

  const teamParam = (params.get('team') ?? '').toLowerCase()
  const team = TEAMS.find((t) => t.toLowerCase() === teamParam) ?? null
  // The search box keeps its own text and the URL follows it. Reading the
  // box straight from the URL dropped letters when typing fast: the router
  // commits URL changes in a transition, so the box snapped back between
  // keys. Clear search is the only other thing that changes it here.
  const [query, setQuery] = useState(() => params.get('q') ?? '')
  // The board trails the box by a frame or two. At a few hundred reps the
  // first letter brings in a hundred rows, and the box shouldn't wait on them.
  const shownQuery = useDeferredValue(query)
  const needle = shownQuery.trim().toLowerCase()

  const update = (key: string, value: string | null) =>
    setParams(
      (current) => {
        const out = new URLSearchParams(current)
        if (value) out.set(key, value)
        else out.delete(key)
        return out
      },
      { replace: true },
    )
  const search = (value: string) => {
    setQuery(value)
    update('q', value || null)
    // Clear search goes away with the empty state, so an empty search puts
    // focus back in the box. Typing it empty leaves it there anyway.
    if (!value) document.getElementById('search')?.focus()
  }

  // The figures follow the team filter. Search only narrows the board.
  const teamRows = useMemo(() => (team ? board.filter((row) => row.rep.team === team) : board), [board, team])
  const rows = useMemo(() => (needle ? teamRows.filter((row) => row.rep.name.toLowerCase().includes(needle)) : teamRows), [teamRows, needle])
  const figures = useMemo(() => figuresFor(teamRows), [teamRows])
  const scope = team ? `${team} reps` : 'reps'

  // Gaps opened with Show more belong to this team filter. Change it and
  // the board folds back up. A search draws everyone anyway, so the gaps
  // you opened are still open once you clear it.
  const { openedGaps, openGap, closeGaps } = app
  const view = team ?? 'all'
  const opened = openedGaps.key === view ? openedGaps.spans : NONE
  useEffect(() => {
    if (openedGaps.spans.length && openedGaps.key !== view) closeGaps()
  }, [openedGaps, view, closeGaps])

  // See all on the podium opens the tie on the board, the way Show more
  // would have, all of it at once, then takes you to the first rep in it.
  // A board short enough to draw everyone already has them.
  const [jump, setJump] = useState<{ id: string } | null>(null)
  const seeAll = (span: Span) => {
    const first = teamRows[span.start]
    if (!first) return
    if (teamRows.length > BOARD.fullUpTo) openGap(view, span)
    setJump({ id: first.rep.id })
  }

  return (
    <div className="standings container">
      <header className="standings__head">
        <h1 className="standings__title">Standings</h1>
        <p className="standings__sub">
          Ranked by how many of the five minimums a rep has met, then by stamps, extras included. Meet all five and you’re above
          the dashed line: qualified for President’s Club. On track means the four activities are done and only the quota result is
          left to come.
        </p>
      </header>

      <Figures figures={figures} scope={scope} />

      <div className="standings__tools">
        <fieldset className="seg">
          <legend>Team</legend>
          <span>
            <input type="radio" name="team" id="team-all" checked={!team} onChange={() => update('team', null)} />
            <label htmlFor="team-all">All teams</label>
          </span>
          {TEAMS.map((t) => (
            <span key={t}>
              <input
                type="radio"
                name="team"
                id={`team-${t.toLowerCase()}`}
                checked={team === t}
                onChange={() => update('team', t.toLowerCase())}
              />
              <label htmlFor={`team-${t.toLowerCase()}`}>{t}</label>
            </span>
          ))}
        </fieldset>
        <div className="field standings__search">
          <label htmlFor="search">Search by name</label>
          <input
            id="search"
            className="input"
            type="search"
            name="q"
            autoComplete="off"
            spellCheck={false}
            value={query}
            onChange={(e) => search(e.target.value)}
          />
        </div>
      </div>

      <section className="scoreboard" aria-label="Scoreboard">
        {!needle && teamRows.length > 0 && <Podium rows={teamRows} team={team} onSeeAll={seeAll} />}
        <Board
          rows={rows}
          viewAsId={viewAs.id}
          team={team}
          query={shownQuery}
          full={Boolean(needle)}
          opened={opened}
          onOpen={(span) => openGap(view, span)}
          onClear={() => search('')}
          jump={jump}
        />
      </section>
    </div>
  )
}
