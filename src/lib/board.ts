// The short board. Past a couple dozen reps Standings stops drawing everyone:
// it shows the top, a few reps either side of the President's Club line and a
// few either side of you, and folds the runs in between into gap rows you can
// open a chunk at a time. Plain index maths, so it's easy to test.

import { BOARD } from '../config'

// A run of board positions. Start is in it, end isn't.
export interface Span {
  start: number
  end: number
}

// What the board draws, top to bottom: runs of reps and the gaps between them.
export interface Piece extends Span {
  kind: 'rows' | 'gap'
}

export interface BoardShape {
  count: number // reps on the board after the team filter and search
  cut: number // index of the first rep below the line, count when nobody is
  you: number // your index, -1 when you're not on this board
  opened: readonly Span[] // runs opened with Show more
  full: boolean // a search shows every match, no gaps
}

export interface BoardRules {
  fullUpTo: number
  top: number
  aroundLine: number
  aroundYou: number
  step: number
  minGap: number
}

export function boardPieces(shape: BoardShape, rules: BoardRules = BOARD): Piece[] {
  const { count, cut, you, opened, full } = shape
  if (count <= 0) return []
  if (full || count <= rules.fullUpTo) return [{ kind: 'rows', start: 0, end: count }]

  // Reps above and below the line, so the dashed line always has someone on
  // both sides of it.
  const wanted: Span[] = [
    { start: 0, end: rules.top },
    { start: cut - rules.aroundLine, end: cut + rules.aroundLine },
    ...opened,
  ]
  if (you >= 0) wanted.push({ start: you - rules.aroundYou, end: you + rules.aroundYou + 1 })

  const spans = wanted
    .map((s) => ({ start: Math.max(0, s.start), end: Math.min(count, s.end) }))
    .filter((s) => s.end > s.start)
    .sort((a, b) => a.start - b.start)

  // Merge runs that overlap, touch, or leave a gap too small to bother with.
  const merged: Span[] = []
  for (const s of spans) {
    const last = merged.at(-1)
    if (last && s.start - last.end < rules.minGap) last.end = Math.max(last.end, s.end)
    else merged.push({ ...s })
  }
  if (!merged.length) return [{ kind: 'gap', start: 0, end: count }]
  if (merged[0].start < rules.minGap) merged[0].start = 0
  if (count - merged.at(-1)!.end < rules.minGap) merged.at(-1)!.end = count

  const pieces: Piece[] = []
  let at = 0
  for (const s of merged) {
    if (s.start > at) pieces.push({ kind: 'gap', start: at, end: s.start })
    pieces.push({ kind: 'rows', ...s })
    at = s.end
  }
  if (at < count) pieces.push({ kind: 'gap', start: at, end: count })
  return pieces
}

// What Show more opens: the next `step` reps from the top of the gap, or the
// whole gap when what's left after that would be too small to keep folded.
export function openFrom(gap: Span, rules: BoardRules = BOARD): Span {
  const end = gap.start + rules.step
  return { start: gap.start, end: gap.end - end < rules.minGap ? gap.end : end }
}
