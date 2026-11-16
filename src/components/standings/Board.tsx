// The board: reps ranked by minimums met, then stamps, with the President's
// Club line drawn across it like a cut line on a golf leaderboard. Past a
// couple dozen reps it's a short board (lib/board.ts): the top, the line and
// you, with gap rows that open the rest. When the demo records a stamp, rows
// slide from their old spots to their new ones.

import { memo, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react'
import { Link } from 'react-router'
import { ACTIVITIES, ACTIVITY_NAMES, QUOTA_DATE, type Activity } from '../../config'
import { boardPieces, openFrom, type Piece, type Span } from '../../lib/board'
import { DATA_PAGE } from '../../lib/book'
import { longDate, plural } from '../../lib/format'
import { progressLabel, quotaWhen, statusWord } from '../../lib/messages'
import { dayBefore, lineIndex, type Change, type StandingRow } from '../../lib/ranking'
import { lastStampDay } from '../../lib/rules'
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
  // See all on the podium: the first rep of the tie it opened. A new
  // object each press, so pressing it again goes there again.
  jump: { id: string } | null
}

const SLIDE_MS = 720
const EASE_OUT = 'cubic-bezier(0.16, 1, 0.3, 1)'
// Reps coming out of a gap fade in right away. Anything still passing over
// them is opaque and on top, so waiting would only leave holes in the board.
const FADE_MS = SLIDE_MS / 3
const COLUMNS = 8
const OF = ACTIVITIES.length

// What each progress mark stands for, for the key over the board.
const KEY_NAMES: Record<Activity, string> = {
  training: 'trainings',
  fair: 'fairs',
  hub: 'Hub courses',
  club: 'Club Express',
  quota: 'quota',
}

// "June 16", no year: the whole board is one program year.
const monthDay = (date: string) => longDate(date).replace(/, \d{4}$/, '')

// How far a rep moved, and against what: the board as it stood the day
// before the latest stamps came in.
function ChangeCell({ change, since }: { change: Change; since: string | null }) {
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
          <span className="visually-hidden">
            {' '}
            {change.places === 1 ? 'place' : 'places'}
            {since ? ` since ${since}` : ''}
          </span>
        </span>
      )
    case 'same':
      return (
        <span className="move move--same">
          Same<span className="visually-hidden"> place{since ? ` as on ${since}` : ''}</span>
        </span>
      )
    case 'none':
      return <span className="visually-hidden">No change yet</span>
  }
}

// Five marks in activity order, filled once that minimum is met. Quota's
// goes gold, like the seal it stands for.
function Marks({ row }: { row: StandingRow }) {
  return (
    <>
      <span className="board__marks" aria-hidden="true">
        {ACTIVITIES.map((a) => (
          <span key={a} className={`board__mark board__mark--${a}${row.stats.progress[a].met ? ' is-met' : ''}`} />
        ))}
      </span>
      <span className="visually-hidden">
        {ACTIVITIES.map((a) => {
          const label = progressLabel(row.stats.progress[a])
          return `${ACTIVITY_NAMES[a]} ${a === 'quota' ? label.toLowerCase() : label}`
        }).join(', ')}
      </span>
    </>
  )
}

// One rep. Memoised, so a keystroke in search or a gap opening doesn't redraw
// the rows that stayed put.
const RepRow = memo(function RepRow({ row, you, since }: { row: StandingRow; you: boolean; since: string | null }) {
  // Four characters, like T254, take a smaller size to fit a phone's rank
  // column. Three, like T24, only crowd your Ember block there.
  const chars = `${row.tied ? 'T' : ''}${row.rank}`.length
  const size = chars > 3 ? ' board__rank--long' : chars === 3 ? ' board__rank--three' : ''
  return (
    <tr role="row" data-rep={row.rep.id} className={`board__row${row.above ? ' is-above' : ' is-below'}${you ? ' is-you' : ''}`}>
      <td role="cell" className={`board__rank${size}`}>
        {row.tied && <span className="visually-hidden">Tied </span>}
        {row.tied ? 'T' : ''}
        {row.rank}
      </td>
      <td role="cell" className="board__change">
        <ChangeCell change={row.change} since={since} />
      </td>
      <th role="rowheader" scope="row" className="board__rep">
        <Link to={`/passport/${row.rep.id}?page=${DATA_PAGE}`} className="board__link">
          {row.rep.name}
        </Link>
        {you && <span className="tag tag--you">You</span>}
      </th>
      <td role="cell" className="board__team">
        {row.rep.team}
      </td>
      <td role="cell" className="board__met">
        {row.stats.met} of {OF}
        <span className="visually-hidden"> met</span>
      </td>
      <td role="cell" className="board__progress">
        <Marks row={row} />
      </td>
      <td role="cell" className="board__stamps">
        {/* Phones drop the header row, so the unit shows there. */}
        <span className="board__val">{row.stats.total}</span>
        <span className="board__unit"> {row.stats.total === 1 ? 'stamp' : 'stamps'}</span>
      </td>
      <td role="cell" className={`board__status board__status--${row.status}`}>
        {statusWord(row.status, row.stats)}
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
      <td role="cell" colSpan={COLUMNS}>
        <div className="board__gap-in">
          <svg className="board__gap-mark" viewBox="0 0 4 16" aria-hidden="true">
            <circle cx="2" cy="2" r="1.5" />
            <circle cx="2" cy="8" r="1.5" />
            <circle cx="2" cy="14" r="1.5" />
          </svg>
          <span id={id} className="board__gap-count">
            {plural(count, 'more rep', 'more reps')}
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

export function Board({ rows, viewAsId, team, query, full, opened, onOpen, onClear, jump }: Props) {
  const { slideFrom, clearSlide, ready } = useApp()
  const reduced = useReducedMotion()
  const bodyRef = useRef<HTMLTableSectionElement>(null)

  // Change compares each rank with the board the day before the latest stamps.
  const model = ready?.model
  const ctx = ready?.ctx
  const since = useMemo(() => {
    const latest = model && ctx ? lastStampDay(model, ctx) : null
    return latest ? monthDay(dayBefore(latest)) : null
  }, [model, ctx])

  const cut = lineIndex(rows)
  // Nobody over the line yet. Rather than leave the line hanging off the top,
  // a row above it says so. A search skips it: it's about the whole board.
  const none = cut === 0 && !full
  const youAt = rows.findIndex((row) => row.rep.id === viewAsId)
  const pieces = useMemo(() => boardPieces({ count: rows.length, cut, you: youAt, opened, full }), [rows.length, cut, youAt, opened, full])
  const drawn = pieces.reduce((sum, piece) => sum + (piece.kind === 'rows' ? piece.end - piece.start : 0), 0)

  // How tall each rep row (and the nobody-yet row) was the last time the
  // board drew, at this window width. A row that's gone on Record isn't
  // there to measure any more, and the rows under it need its real height.
  const lastHeights = useRef<{ width: number; heights: Map<string, number>; none?: number } | null>(null)

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
    const last = lastHeights.current?.width === window.innerWidth ? lastHeights.current : undefined
    const heightWas = (id: string) => now.get(id)?.height ?? last?.heights.get(id) ?? rowHeight
    const noneHeight = heightOf('.board__none') ?? last?.none ?? rowHeight

    const ids = new Set(rows.map((row) => row.rep.id))
    const before = slideFrom.order.filter((id) => ids.has(id))
    const oldCut = before.filter((id) => slideFrom.above.has(id)).length
    const oldPieces = boardPieces({ count: before.length, cut: oldCut, you: before.indexOf(viewAsId), opened, full })
    const from = new Map<string, { top: number; folded: boolean }>()
    const oldGaps: { start: number; end: number; top: number }[] = []
    let cutWas: number | undefined
    let noneWas: number | undefined
    let y = boxes[0]?.top ?? 0
    // The old board's nobody-yet row, when nobody was over the line then.
    if (oldCut === 0 && !full && before.length) {
      noneWas = y
      y += noneHeight + space
    }
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
      el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FADE_MS, easing: 'ease-out' })

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
      } else if (el.classList.contains('board__gap') || el.classList.contains('board__none')) {
        top = el.classList.contains('board__none') ? noneWas : gapWas.get(el)
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
    let noneHeight: number | undefined
    for (const el of body.children as HTMLCollectionOf<HTMLElement>) {
      if (el.dataset.rep) heights.set(el.dataset.rep, el.getBoundingClientRect().height)
      else if (el.classList.contains('board__none')) noneHeight = el.getBoundingClientRect().height
    }
    lastHeights.current = { width: window.innerWidth, heights, none: noneHeight ?? lastHeights.current?.none }
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

  // See all puts focus on the first rep of the tie, by now drawn, and
  // brings their row up to the top of the screen, under the page's scroll
  // padding. Once per press.
  const jumped = useRef<Props['jump']>(null)
  useLayoutEffect(() => {
    if (!jump || jumped.current === jump) return
    jumped.current = jump
    const row = bodyRef.current?.querySelector<HTMLElement>(`[data-rep="${CSS.escape(jump.id)}"]`)
    if (!row) return
    row.querySelector<HTMLElement>('.board__link')?.focus({ preventScroll: true })
    row.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' })
  }, [jump, reduced])

  if (rows.length === 0) {
    return (
      <div className="board-empty" role="status">
        <p className="board-empty__title">{query ? `Nobody named “${query}”${team ? ` on ${team}` : ''}` : `Nobody on ${team ?? 'the board'} yet`}</p>
        <p className="board-empty__text">
          {query ? 'Check the spelling, or search the whole board instead.' : 'Reps show up here once the passport data lists them.'}
        </p>
        {query && (
          <button type="button" className="btn board-empty__action" onClick={onClear}>
            Clear search
          </button>
        )}
      </div>
    )
  }

  const noneRow = (
    <tr key="none" className="board__none" role="row">
      <td colSpan={COLUMNS} role="cell">
        <span className="board__none-in">
          <svg className="board__none-seal" viewBox="0 0 20 20" aria-hidden="true">
            <circle cx="10" cy="10" r="8.5" />
          </svg>
          <span>
            Nobody{team ? ` on ${team}` : ''} has met all five yet.
            {ctx && ctx.today <= QUOTA_DATE ? ` ${quotaWhen()}.` : ''}
          </span>
        </span>
      </td>
    </tr>
  )
  const cutRow = (
    <tr key="cut" className="board__cut" role="row">
      <td colSpan={COLUMNS} role="cell">
        <span className="board__cut-label">President’s Club line: all five met</span>
      </td>
    </tr>
  )
  // Top to bottom: runs of reps and the gaps between them, with the line
  // just above the first rep under it. The short board always draws the
  // reps either side of the line, so it never lands inside a gap.
  const body: ReactNode[] = []
  if (none) body.push(noneRow)
  for (const piece of pieces) {
    if (piece.kind === 'gap') {
      if (piece.start === cut) body.push(cutRow)
      // Keyed by its end: it shrinks from the top as it opens.
      body.push(<GapRow key={`gap-${piece.end}`} gap={piece} below={piece.start >= cut} total={rows.length} onOpen={open} />)
      continue
    }
    for (let i = piece.start; i < piece.end; i++) {
      if (i === cut) body.push(cutRow)
      body.push(<RepRow key={rows[i].rep.id} row={rows[i]} you={rows[i].rep.id === viewAsId} since={since} />)
    }
  }
  if (cut === rows.length) body.push(cutRow)

  return (
    <div className="board-wrap">
      <div className="board__head">
        <h2 className="board__title">The board</h2>
        <p className="board__key">
          <span className="board__marks board__marks--key" aria-hidden="true">
            {ACTIVITIES.map((a) => (
              <span key={a} className={`board__mark board__mark--${a} is-met`} />
            ))}
          </span>
          <span>Progress marks, in order: {ACTIVITIES.map((a) => KEY_NAMES[a]).join(', ')}.</span>
        </p>
      </div>
      {/* Screen readers hear how much of the board this is. The gap rows show it to everyone else. */}
      {drawn < rows.length && (
        <p id="board-shown" className="visually-hidden">
          Showing {drawn} of {rows.length} reps. Each gap row has a button that shows more.
        </p>
      )}
      <table
        className="board"
        role="table"
        aria-label={`Standings${team ? ` for ${team}` : ''}, ranked by minimums met, then stamps`}
        aria-describedby={drawn < rows.length ? 'board-shown' : undefined}
      >
        <thead role="rowgroup">
          <tr role="row">
            <th scope="col" role="columnheader">Rank</th>
            <th scope="col" role="columnheader">
              Change{since && <span className="visually-hidden"> since {since}</span>}
            </th>
            <th scope="col" role="columnheader">Rep</th>
            <th scope="col" role="columnheader">Team</th>
            <th scope="col" role="columnheader">Met</th>
            <th scope="col" role="columnheader">Progress</th>
            <th scope="col" role="columnheader">Stamps</th>
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
