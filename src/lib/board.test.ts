// Tests for the short board: which reps get drawn and where the gaps go.

import { describe, expect, it } from 'vitest'
import { BOARD } from '../config'
import { boardPieces, openFrom, type BoardShape, type Piece } from './board'

const shape = (over: Partial<BoardShape>): BoardShape => ({ count: 60, cut: 27, you: -1, opened: [], full: false, ...over })
const rows = (start: number, end: number): Piece => ({ kind: 'rows', start, end })
const gap = (start: number, end: number): Piece => ({ kind: 'gap', start, end })
// Every index that gets drawn.
const drawn = (pieces: Piece[]) => pieces.filter((p) => p.kind === 'rows').flatMap((p) => Array.from({ length: p.end - p.start }, (_, i) => p.start + i))

describe('boardPieces', () => {
  it('uses the defaults from the brief', () => {
    expect(BOARD).toMatchObject({ fullUpTo: 25, top: 10, aroundLine: 2, aroundYou: 3, step: 50 })
  })

  it('draws everyone on a board of 25 or fewer', () => {
    expect(boardPieces(shape({ count: 12, cut: 6, you: 3 }))).toEqual([rows(0, 12)])
    expect(boardPieces(shape({ count: 25, cut: 20 }))).toEqual([rows(0, 25)])
    expect(boardPieces(shape({ count: 0, cut: 0 }))).toEqual([])
  })

  it('draws every match while searching, however many there are', () => {
    expect(boardPieces(shape({ count: 300, cut: 140, you: 200, full: true }))).toEqual([rows(0, 300)])
  })

  it('shows the top 10, two either side of the line and three either side of you', () => {
    // Hannah at 600 reps: 305th, under a line at 287.
    expect(boardPieces(shape({ count: 600, cut: 287, you: 304 }))).toEqual([
      rows(0, 10),
      gap(10, 285),
      rows(285, 289),
      gap(289, 301),
      rows(301, 308),
      gap(308, 600),
    ])
  })

  it('merges windows that overlap or touch', () => {
    // The 60 rep sample before Record: Hannah sits right on the line.
    expect(boardPieces(shape({ cut: 27, you: 27 }))).toEqual([rows(0, 10), gap(10, 24), rows(24, 31), gap(31, 60)])
    // You end at 24 and the line's window starts at 24.
    expect(boardPieces(shape({ count: 100, cut: 26, you: 20 }))).toEqual([rows(0, 10), gap(10, 17), rows(17, 28), gap(28, 100)])
  })

  it('draws a lone hidden rep instead of folding them into a gap', () => {
    // Your window ends at 27 and the line's starts at 29, which would leave
    // rep 28 alone in a gap row as tall as their own row.
    expect(boardPieces(shape({ cut: 31, you: 24 }))).toEqual([rows(0, 10), gap(10, 21), rows(21, 33), gap(33, 60)])
    expect(boardPieces(shape({ count: 40, cut: 13 }))).toEqual([rows(0, 15), gap(15, 40)])
    expect(boardPieces(shape({ count: 40, cut: 37 }))).toEqual([rows(0, 10), gap(10, 35), rows(35, 40)])
  })

  it('always draws the reps either side of the line', () => {
    for (const count of [26, 60, 300, 600]) {
      for (const cut of [0, 1, 9, 10, 11, Math.floor(count / 2), count - 1, count]) {
        for (const you of [-1, 0, Math.min(cut, count - 1), count - 1]) {
          const shown = new Set(drawn(boardPieces(shape({ count, cut, you }))))
          if (cut > 0) expect(shown.has(cut - 1), `${count} ${cut} ${you} above`).toBe(true)
          if (cut < count) expect(shown.has(cut), `${count} ${cut} ${you} below`).toBe(true)
          if (you >= 0) expect(shown.has(you), `${count} ${cut} ${you} you`).toBe(true)
        }
      }
    }
  })

  it('covers the board exactly once, in order, with no two gaps or two runs in a row', () => {
    for (const s of [shape({ count: 600, cut: 287, you: 304 }), shape({ cut: 0, you: 59 }), shape({ cut: 60, you: 0 }), shape({ count: 26, cut: 13, you: 13 })]) {
      const pieces = boardPieces(s)
      expect(pieces[0].start).toBe(0)
      expect(pieces.at(-1)!.end).toBe(s.count)
      pieces.forEach((p, i) => {
        expect(p.end).toBeGreaterThan(p.start)
        if (i) {
          expect(p.start).toBe(pieces[i - 1].end)
          expect(p.kind).not.toBe(pieces[i - 1].kind)
        }
        if (p.kind === 'gap') expect(p.end - p.start).toBeGreaterThanOrEqual(BOARD.minGap)
      })
    }
  })

  it('leaves out your window when you are not on this board', () => {
    expect(boardPieces(shape({ count: 120, cut: 60, you: -1 }))).toEqual([rows(0, 10), gap(10, 58), rows(58, 62), gap(62, 120)])
  })

  it('keeps unranked reps at the bottom in the last gap unless a window reaches them', () => {
    // A new hire at the very bottom: their window runs to the end.
    expect(boardPieces(shape({ cut: 27, you: 59 }))).toEqual([rows(0, 10), gap(10, 25), rows(25, 29), gap(29, 56), rows(56, 60)])
  })

  it('draws opened runs, and a gap shrinks from the top as it opens', () => {
    const first = openFrom({ start: 10, end: 285 })
    expect(first).toEqual({ start: 10, end: 60 })
    expect(boardPieces(shape({ count: 600, cut: 287, you: 304, opened: [first] })).slice(0, 2)).toEqual([rows(0, 60), gap(60, 285)])
    const second = openFrom({ start: 60, end: 285 })
    const third = openFrom({ start: 110, end: 285 })
    const pieces = boardPieces(shape({ count: 600, cut: 287, you: 304, opened: [first, second, third] }))
    expect(pieces.slice(0, 2)).toEqual([rows(0, 160), gap(160, 285)])
  })

  it('opens a gap whole when it holds 50 or fewer, or when one rep would be left', () => {
    expect(openFrom({ start: 10, end: 24 })).toEqual({ start: 10, end: 24 })
    expect(openFrom({ start: 10, end: 60 })).toEqual({ start: 10, end: 60 })
    expect(openFrom({ start: 10, end: 61 })).toEqual({ start: 10, end: 61 })
    expect(openFrom({ start: 10, end: 62 })).toEqual({ start: 10, end: 60 })
    expect(boardPieces(shape({ cut: 27, you: 27, opened: [openFrom({ start: 10, end: 24 })] }))).toEqual([rows(0, 31), gap(31, 60)])
  })

  it('ignores opened runs past the end of a smaller board', () => {
    expect(boardPieces(shape({ count: 40, cut: 20, opened: [{ start: 30, end: 90 }] }))).toEqual([rows(0, 10), gap(10, 18), rows(18, 22), gap(22, 30), rows(30, 40)])
  })

  it('takes other rules', () => {
    const rules = { ...BOARD, fullUpTo: 5, top: 3, aroundLine: 1, aroundYou: 1, minGap: 1 }
    expect(boardPieces(shape({ count: 20, cut: 10, you: 15 }), rules)).toEqual([rows(0, 3), gap(3, 9), rows(9, 11), gap(11, 14), rows(14, 17), gap(17, 20)])
  })
})
