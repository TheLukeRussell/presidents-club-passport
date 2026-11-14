// The board: reps ranked, with the President's Club line drawn across it like
// a cut line on a golf leaderboard. Past a couple dozen reps it's a short
// board (lib/board.ts): the top, the line and you, with gap rows that open
// the rest. When today's attendance gets recorded, rows slide from their old
// spots to their new ones.

import { memo, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react'
import { Link } from 'react-router'
import { LINE } from '../../config'
import { boardPieces, openFrom, type Piece, type Span } from '../../lib/board'
import { DATA_PAGE } from '../../lib/book'
import { lineIndex, type Change, type StandingRow } from '../../lib/ranking'
import { percentOf } from '../../lib/rules'
import { useApp, type SlideFrom } from '../../state/AppState'
import { useReducedMotion } from '../../state/useMedia'
import './Board.css'

interface Props {
  rows: StandingRow[]
  viewAsId: string
  team: string | null
  query: string
  full: boolean // searching, so every match shows and nothing folds
  opened: readonly Span[]
  onOpen: (span: Span) => void
  onClear: () => void
}

const SLIDE_MS = 720
const EASE_OUT = 'cubic-bezier(0.16, 1, 0.3, 1)'
// Reps coming out of a gap fade in once the slide is most of the way
// there. Anything still passing over them is opaque and on top, so waiting
// longer would only leave holes in the board.
const FADE_DELAY = SLIDE_MS / 4
const FADE_MS = SLIDE_MS / 2

function ChangeCell({ change }: { change: Change }) {
  switch (change.kind) {
    case 'up':
    case 'down':
      return (
        <span className={`move move--${change.kind}`}>
          <svg viewBox="0 0 12 12" aria-hidden="true">
            <path d={change.kind === 'up' ? 'M6 2 11 10H1Z' : 'M6 10 1 2h10Z'} />
          </svg>
          <span className="visually-hidden">{change.kind === 'up' ? 'Up' : 'Down'} </span>
          {change.places}
          <span className="visually-hidden"> since the last training</span>
        </span>
      )
    case 'same':
      return <span className="move move--same">Same</span>
    case 'new':
      return <span className="move move--new">New</span>
    case 'none':
      return <span className="visually-hidden">No change yet</span>
  }
}

// One rep. Memoised, so a keystroke in search or a gap opening doesn't redraw
// the rows that stayed put.
const RepRow = memo(function RepRow({ row, you }: { row: StandingRow; you: boolean }) {
  const status = row.rank === null ? 'Unranked' : row.above ? 'Above' : 'Below'
  // Four characters, like T254, take a smaller size to fit a phone's rank column.
  const long = row.rank !== null && `${row.tied ? 'T' : ''}${row.rank}`.length > 3
  return (
    <tr
      role="row"
      data-rep={row.rep.id}
      className={`board__row${row.rank === null ? ' is-unranked' : row.above ? ' is-above' : ' is-below'}${you ? ' is-you' : ''}`}
    >
      <td role="cell" className={`board__rank${long ? ' board__rank--long' : ''}`}>
        {row.rank === null ? (
          <>
            <span aria-hidden="true">NR</span>
            <span className="visually-hidden">Not ranked</span>
          </>
        ) : (
          <>
            {row.tied && <span className="visually-hidden">Tied </span>}
            {row.tied ? 'T' : ''}
            {row.rank}
          </>
        )}
      </td>
      <td role="cell" className="board__change" data-label="Change">
        <ChangeCell change={row.change} />
      </td>
      <th role="rowheader" scope="row" className="board__rep">
        <Link to={`/passport/${row.rep.id}?page=${DATA_PAGE}`} className="board__link">
          {row.rep.name}
        </Link>
        {you && <span className="tag tag--you">You</span>}
      </th>
      <td role="cell" className="board__team" data-label="Team">
        <span className="board__val">{row.rep.team}</span>
      </td>
      <td role="cell" className="board__stamps" data-label="Stamps">
        <span className="board__val">
          {row.stats.attended} of {row.stats.recorded}
        </span>
      </td>
      <td role="cell" className="board__rate">
        {row.stats.rate === null ? 'None' : `${percentOf(row.stats.rate)}%`}
      </td>
      <td role="cell" className="board__streak" data-label="Streak">
        <span className="board__val">{row.stats.streak}</span>
      </td>
      <td role="cell" className="board__status" data-label="Status">
        {status}
      </td>
    </tr>
  )
})

// A run of reps the short board leaves out. Like the line, it's one cell
// across every column, so the table still reads row by row. It says how many
// it hides, and its button opens the next chunk from the top. The button's
// name also says which places it opens, so two gaps never sound the same.
function GapRow({ gap, below, total, onOpen }: { gap: Piece; below: boolean; total: number; onOpen: (gap: Piece, span: Span) => void }) {
  const count = gap.end - gap.start
  const next = openFrom(gap)
  const all = next.end === gap.end
  const id = `board-gap-${gap.end}`
  const label = !all ? `Show ${next.end - next.start} more` : count === 2 ? 'Show both' : `Show all ${count}`
  const places = count === 2 && all ? `${next.start + 1} and ${next.end}` : `${next.start + 1} to ${next.end}`
  return (
    <tr role="row" className={`board__gap${below ? ' is-below' : ''}`}>
      <td role="cell" colSpan={8}>
        <div className="board__gap-in">
          <svg className="board__gap-mark" viewBox="0 0 4 16" aria-hidden="true">
            <circle cx="2" cy="2" r="1.5" />
            <circle cx="2" cy="8" r="1.5" />
            <circle cx="2" cy="14" r="1.5" />
          </svg>
          <span id={id} className="board__gap-count">
            {count} more {count === 1 ? 'rep' : 'reps'}
          </span>
          <button
            type="button"
            className="btn btn--quiet board__gap-more"
            aria-label={`${label}, reps ${places} of ${total}`}
            aria-describedby={id}
            onClick={() => onOpen(gap, next)}
          >
            {label}
          </button>
        </div>
      </td>
    </tr>
  )
}

export function Board({ rows, viewAsId, team, query, full, opened, onOpen, onClear }: Props) {
  const { slideFrom, clearSlide } = useApp()
  const reduced = useReducedMotion()
  const bodyRef = useRef<HTMLTableSectionElement>(null)

  const cut = lineIndex(rows)
  const youAt = rows.findIndex((row) => row.rep.id === viewAsId)
  const pieces = useMemo(() => boardPieces({ count: rows.length, cut, you: youAt, opened, full }), [rows.length, cut, youAt, opened, full])
  const drawn = pieces.reduce((sum, piece) => sum + (piece.kind === 'rows' ? piece.end - piece.start : 0), 0)

  // How tall each rep row was the last time the board drew, at this window
  // width. A rep that folds away on Record isn't there to measure any more,
  // and the reps under it on the old board need its real height.
  const lastHeights = useRef<{ width: number; heights: Map<string, number> } | null>(null)

  // The row slide, done FLIP style. The board is already drawn in its new
  // order. Work out where each row sat before the recording by drawing the
  // old board again (same reps, filter and opened gaps, the line where it
  // was) and laying it out from the top with each row's real height. Then
  // jump each row back there with a transform and let it glide home, all
  // together. The line and the gap rows slide too. Whatever moves rides
  // over whatever doesn't (reps over the line and gaps, you over everyone),
  // and every row is opaque, so rows passing each other never print text
  // over text. Reps that were folded into a gap fade in where they land,
  // underneath, once the slide is mostly done; reps that fold away just go.
  // It plays once per recording, even when React runs the effect twice.
  const played = useRef<SlideFrom | null>(null)
  useLayoutEffect(() => {
    if (!slideFrom || played.current === slideFrom) return
    played.current = slideFrom
    const body = bodyRef.current
    if (!body || reduced) {
      clearSlide()
      return
    }
    // Every row the board drew, measured once: reps, gaps and the line.
    const kids = Array.from(body.children) as HTMLElement[]
    const boxes = kids.map((el) => el.getBoundingClientRect())
    const now = new Map<string, DOMRect>()
    kids.forEach((el, k) => el.dataset.rep && now.set(el.dataset.rep, boxes[k]))
    const heightOf = (selector: string) => {
      const k = kids.findIndex((el) => el.matches(selector))
      return k === -1 ? undefined : boxes[k].height
    }
    const rowHeight = heightOf('.board__row:not(.is-you)') ?? heightOf('.board__row') ?? 0
    const gapHeight = heightOf('.board__gap') ?? rowHeight
    const cutHeight = heightOf('.board__cut') ?? 0
    // The space between two neighbouring rows (none in a table, or on phones today).
    const space = kids.length > 1 ? boxes[1].top - boxes[0].bottom : 0
    const last = lastHeights.current?.width === window.innerWidth ? lastHeights.current.heights : undefined
    const heightWas = (id: string) => now.get(id)?.height ?? last?.get(id) ?? rowHeight

    const ids = new Set(rows.map((row) => row.rep.id))
    const before = slideFrom.order.filter((id) => ids.has(id))
    const oldCut = before.filter((id) => slideFrom.above.has(id)).length
    const oldPieces = boardPieces({ count: before.length, cut: oldCut, you: before.indexOf(viewAsId), opened, full })
    const from = new Map<string, { top: number; folded: boolean }>()
    const oldGaps: { start: number; end: number; top: number }[] = []
    let cutWas: number | undefined
    let y = boxes[0]?.top ?? 0
    const line = () => {
      cutWas = y
      y += cutHeight + space
    }
    for (const piece of oldPieces) {
      if (piece.kind === 'gap') {
        if (piece.start === oldCut) line()
        for (let k = piece.start; k < piece.end; k++) from.set(before[k], { top: y, folded: true })
        oldGaps.push({ start: piece.start, end: piece.end, top: y })
        y += gapHeight + space
        continue
      }
      for (let k = piece.start; k < piece.end; k++) {
        if (k === oldCut) line()
        from.set(before[k], { top: y, folded: false })
        y += heightWas(before[k]) + space
      }
    }
    // Nobody under the line: it sat at the very bottom.
    cutWas ??= y

    // Each gap row slides from the old gap that covered most of the same
    // places on the board. One with nothing to match fades in like a rep.
    const gapWas = new Map<HTMLElement, number>()
    const gapRows = kids.filter((el) => el.classList.contains('board__gap'))
    const taken = new Set<number>()
    pieces
      .filter((piece) => piece.kind === 'gap')
      .forEach((gap, g) => {
        let best = -1
        let most = 0
        oldGaps.forEach((old, j) => {
          const shared = Math.min(old.end, gap.end) - Math.max(old.start, gap.start)
          if (!taken.has(j) && shared > most) [best, most] = [j, shared]
        })
        if (best === -1 || !gapRows[g]) return
        taken.add(best)
        gapWas.set(gapRows[g], oldGaps[best].top)
      })

    // Bring your row on screen so the slide plays where you can see it:
    // centred between where it was and where it lands when both fit. When
    // they don't, the new spot wins, with a row (or the page's scroll
    // padding, if that's more) above it and a row below, never flush
    // against an edge. The slide only uses differences, so scrolling after
    // measuring doesn't throw it off.
    const mine = kids.findIndex((el) => el.dataset.rep === viewAsId)
    if (mine !== -1) {
      const to = boxes[mine]
      const was = from.get(viewAsId)?.top ?? to.top
      const top = Math.min(to.top, was)
      const bottom = Math.max(to.bottom, was + to.height)
      const screen = window.innerHeight
      if (top < 0 || bottom > screen) {
        const above = Math.max(rowHeight, parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0)
        const centred = (top + bottom - screen) / 2
        window.scrollBy(0, Math.min(Math.max(centred, to.bottom + rowHeight - screen), to.top - above))
      }
    }

    // A slide cut short by another one can leave a row lifted. Start clean.
    kids.forEach((el) => el.classList.remove('is-sliding'))
    const slide = (el: HTMLElement, dy: number) => {
      el.classList.add('is-sliding')
      const motion = el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: SLIDE_MS, easing: EASE_OUT })
      const settle = () => {
        if (played.current === slideFrom) el.classList.remove('is-sliding')
      }
      motion.addEventListener('finish', settle)
      motion.addEventListener('cancel', settle)
    }
    const fadeIn = (el: HTMLElement) =>
      el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FADE_MS, delay: FADE_DELAY, easing: 'ease-out', fill: 'backwards' })

    kids.forEach((el, k) => {
      let top: number | undefined
      if (el.dataset.rep) {
        const start = from.get(el.dataset.rep)
        if (start?.folded) {
          fadeIn(el)
          return
        }
        top = start?.top
      } else if (el.classList.contains('board__cut')) {
        top = cutWas
      } else if (el.classList.contains('board__gap')) {
        top = gapWas.get(el)
        if (top === undefined) {
          fadeIn(el)
          return
        }
      }
      if (top !== undefined && Math.abs(top - boxes[k].top) >= 0.5) slide(el, top - boxes[k].top)
    })
    clearSlide()
  }, [slideFrom, reduced, clearSlide, rows, viewAsId, opened, full, pieces])

  // After every draw (and after the slide above has read the last one),
  // note how tall each rep row is. Search draws everyone, so nothing folds
  // and there's nothing to keep.
  useLayoutEffect(() => {
    const body = bodyRef.current
    if (!body || full || reduced) {
      lastHeights.current = null
      return
    }
    const heights = new Map<string, number>()
    for (const el of body.children as HTMLCollectionOf<HTMLElement>) {
      if (el.dataset.rep) heights.set(el.dataset.rep, el.getBoundingClientRect().height)
    }
    lastHeights.current = { width: window.innerWidth, heights }
  })

  // Show more puts focus on the first rep it brings in, right where the gap
  // row was, so the button going away never drops focus to the page.
  const focusRep = useRef<string | null>(null)
  useLayoutEffect(() => {
    const id = focusRep.current
    if (!id) return
    focusRep.current = null
    bodyRef.current?.querySelector<HTMLElement>(`[data-rep="${CSS.escape(id)}"] .board__link`)?.focus({ preventScroll: true })
  })
  const open = (gap: Piece, span: Span) => {
    focusRep.current = rows[gap.start]?.rep.id ?? null
    onOpen(span)
  }

  if (rows.length === 0) {
    return (
      <div className="board-empty" role="status">
        <p className="board-empty__title">{query ? `Nobody named “${query}”${team ? ` on ${team}` : ''}` : `Nobody on ${team ?? 'the board'} yet`}</p>
        <p className="board-empty__text">
          {query ? 'Check the spelling, or search the whole board instead.' : 'Reps show up here once the export lists them.'}
        </p>
        {query && (
          <button type="button" className="btn board-empty__action" onClick={onClear}>
            Clear search
          </button>
        )}
      </div>
    )
  }

  const cutRow = (
    <tr key="cut" className="board__cut" role="row">
      <td colSpan={8} role="cell">
        <span className="board__cut-label">
          President’s Club line, {Math.round(LINE * 100)}% (placeholder)
        </span>
      </td>
    </tr>
  )
  // Top to bottom: runs of reps and the gaps between them, with the line
  // just above the first rep under it. The short board always draws the
  // reps either side of the line, so it never lands inside a gap.
  const body: ReactNode[] = []
  for (const piece of pieces) {
    if (piece.kind === 'gap') {
      if (piece.start === cut) body.push(cutRow)
      // Keyed by its end: it shrinks from the top as it opens.
      body.push(<GapRow key={`gap-${piece.end}`} gap={piece} below={piece.start >= cut} total={rows.length} onOpen={open} />)
      continue
    }
    for (let i = piece.start; i < piece.end; i++) {
      if (i === cut) body.push(cutRow)
      body.push(<RepRow key={rows[i].rep.id} row={rows[i]} you={rows[i].rep.id === viewAsId} />)
    }
  }
  if (cut === rows.length) body.push(cutRow)

  return (
    <div className="board-wrap">
      <h2 className="board__title">The board</h2>
      {/* Screen readers hear how much of the board this is. The gap rows show it to everyone else. */}
      {drawn < rows.length && (
        <p id="board-shown" className="visually-hidden">
          Showing {drawn} of {rows.length} reps. Each gap row has a button that shows more.
        </p>
      )}
      <table
        className="board"
        role="table"
        aria-label={`Standings${team ? ` for ${team}` : ''}, ranked by rate`}
        aria-describedby={drawn < rows.length ? 'board-shown' : undefined}
      >
        <thead role="rowgroup">
          <tr role="row">
            <th scope="col" role="columnheader">Rank</th>
            <th scope="col" role="columnheader">Change</th>
            <th scope="col" role="columnheader">Rep</th>
            <th scope="col" role="columnheader">Team</th>
            <th scope="col" role="columnheader">Stamps</th>
            <th scope="col" role="columnheader">Rate</th>
            <th scope="col" role="columnheader">Streak</th>
            <th scope="col" role="columnheader">Status</th>
          </tr>
        </thead>
        <tbody ref={bodyRef} role="rowgroup">
          {body}
        </tbody>
      </table>
    </div>
  )
}
