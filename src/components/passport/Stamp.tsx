// One stamp: a shape in its ink, tilted a little, with a few words inside.
// Trainings carry the supplier and date, fairs the fair and its city, Hub
// courses the supplier and HUB, Club Express its season. Text only, no
// logos. Drawn as SVG so the shape, the text and the tilt all scale together.

import { useEffect, useLayoutEffect, useRef, type CSSProperties } from 'react'
import type { Stamp as StampData } from '../../lib/model'
import { stampLook, type StampShape } from '../../lib/stamps'
import './Stamp.css'

interface Props {
  stamp: StampData
  repEmail: string
  landing?: boolean
}

const W = 140
const H = 110
// How far above the stamp the stamper starts its swing, in pixels, so it
// should be on screen too when the stamp lands.
const STAMPER_ROOM = 110
// A little air between the endorsement and the sticky page bar.
const BAR_GAP = 8
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

// The widest the name lines and the line under the rule can run inside each
// shape, in SVG units. The lower line sits where round, angled and pointed
// shapes narrow. Club Express sets its own (see layoutFor).
const ROOM: Record<StampShape, number> = { circle: 88, rect: 118, oval: 100, hexagon: 96, ticket: 108, octagon: 96, banner: 90, shield: 100, diamond: 92 }
const SUB_ROOM: Record<StampShape, number> = { circle: 78, rect: 118, oval: 96, hexagon: 84, ticket: 108, octagon: 96, banner: 96, shield: 60, diamond: 46 }

// Bold Gotham or Helvetica capitals average about two thirds of an em wide.
// Close enough to pick a size and decide whether a name needs two lines; the
// effect below measures the real thing and squeezes anything that still spills.
const CHAR = 0.64
const MAX_SIZE = 24
const MIN_SIZE = 18

function fitLines(name: string, room: number): { lines: string[]; size: number } {
  const upper = name.toUpperCase()
  const oneLine = room / (upper.length * CHAR)
  if (oneLine >= MIN_SIZE || !upper.includes(' ')) {
    return { lines: [upper], size: Math.min(MAX_SIZE, Math.max(MIN_SIZE, oneLine)) }
  }
  // Too long for one line: break at the space nearest the middle.
  const words = upper.split(' ')
  let best = 1
  let bestDiff = Infinity
  for (let i = 1; i < words.length; i++) {
    const diff = Math.abs(words.slice(0, i).join(' ').length - words.slice(i).join(' ').length)
    if (diff < bestDiff) [best, bestDiff] = [i, diff]
  }
  const lines = [words.slice(0, best).join(' '), words.slice(best).join(' ')]
  const longest = Math.max(...lines.map((l) => l.length))
  return { lines, size: Math.min(MAX_SIZE - 2, Math.max(MIN_SIZE, room / (longest * CHAR))) }
}

// 17 JUN 27, the way a border stamp prints it.
function stampDay(date: string): string {
  const [y, m, d] = date.split('-')
  return `${d} ${MONTHS[Number(m) - 1]} ${y.slice(2)}`
}

// "Fall Supplier Fair" prints as FALL FAIR. Anything else keeps its name.
function fairName(event: string): string {
  const short = event.replace(/\bsupplier\b/i, '').replace(/\s+/g, ' ').trim()
  return short || 'FAIR'
}

// "Club Express Spring" prints as SPRING. A name without a season gets one
// from its month.
const SEASONS = ['WINTER', 'WINTER', 'SPRING', 'SPRING', 'SPRING', 'SUMMER', 'SUMMER', 'SUMMER', 'FALL', 'FALL', 'FALL', 'WINTER']
function clubSeason(stamp: StampData): string {
  const rest = stamp.event.replace(/club\s*express/i, '').replace(/\s+/g, ' ').trim()
  return rest ? rest.toUpperCase() : SEASONS[Number(stamp.date.slice(5, 7)) - 1]
}

interface Line {
  text: string
  y: number
  size: number
  room: number
  kind: 'name' | 'sub'
}

interface Layout {
  lines: Line[]
  ruleY: number
}

// Where the lines sit, each as [one name line, two name lines].
interface Heights {
  top: [number, number]
  rule: [number, number]
  sub: [number, number]
  subSize: number
}

// Name lines on top, a short rule, then one smaller line under it. Each
// shape gets its own heights so nothing crowds a point or a notch.
function stacked(name: string, sub: string, shape: StampShape, at: Heights): Layout {
  const { lines, size } = fitLines(name, ROOM[shape])
  const two = lines.length === 2 ? 1 : 0
  return {
    lines: [
      ...lines.map((text, i) => ({ text, y: at.top[two] + i * (size + 1), size, room: ROOM[shape], kind: 'name' as const })),
      { text: sub, y: at.sub[two], size: at.subSize, room: SUB_ROOM[shape], kind: 'sub' },
    ],
    ruleY: at.rule[two],
  }
}

const PLAIN: Heights = { top: [52, 36], rule: [62, 65], sub: [82, 84], subSize: 17 }
const SHIELD: Heights = { top: [46, 32], rule: [57, 60], sub: [79, 81], subSize: 17 }
const BANNER: Heights = { top: [52, 38], rule: [62, 66], sub: [82, 85], subSize: 16 }

function layoutFor(stamp: StampData, shape: StampShape): Layout {
  switch (stamp.activity) {
    case 'fair':
      return stacked(fairName(stamp.event), (stamp.location || stampDay(stamp.date)).toUpperCase(), shape, BANNER)
    case 'hub':
      return stacked(stamp.supplier || 'Hub course', 'HUB', shape, SHIELD)
    case 'club':
      // A diamond is narrow top and bottom, so the words sit in its middle.
      return {
        lines: [
          { text: 'CLUB', y: 43, size: 18, room: 54, kind: 'name' },
          { text: 'EXPRESS', y: 61, size: 18, room: 92, kind: 'name' },
          { text: clubSeason(stamp), y: 81, size: 12.5, room: SUB_ROOM.diamond, kind: 'sub' },
        ],
        ruleY: 67,
      }
    case 'quota':
      return stacked('Quota', stampDay(stamp.date), shape, PLAIN)
    case 'training':
      return stacked(stamp.supplier || stamp.event, stampDay(stamp.date), shape, PLAIN)
  }
}

function Shape({ shape }: { shape: StampShape }) {
  switch (shape) {
    case 'circle':
      return (
        <>
          <circle cx={70} cy={55} r={54} className="stamp__line--heavy" />
          <circle cx={70} cy={55} r={48} className="stamp__line--light" />
        </>
      )
    case 'rect':
      return (
        <>
          <rect x={3} y={6} width={134} height={98} rx={3} className="stamp__line--heavy" />
          <rect x={9} y={12} width={122} height={86} rx={1} className="stamp__line--light" />
        </>
      )
    case 'oval':
      return (
        <>
          <ellipse cx={70} cy={55} rx={66} ry={51} className="stamp__line--heavy" />
          <ellipse cx={70} cy={55} rx={60} ry={45} className="stamp__line--light" />
        </>
      )
    case 'hexagon':
      return (
        <>
          <polygon points="36,4 104,4 137,55 104,106 36,106 3,55" className="stamp__line--heavy" />
          <polygon points="39,10 101,10 130,55 101,100 39,100 10,55" className="stamp__line--light" />
        </>
      )
    case 'ticket':
      // A rectangle with the corners bitten out, like an admission ticket.
      return (
        <>
          <path d="M14 5 H126 A9 9 0 0 0 135 14 V96 A9 9 0 0 0 126 105 H14 A9 9 0 0 0 5 96 V14 A9 9 0 0 0 14 5 Z" className="stamp__line--heavy" />
          <path d="M16 11 H124 A6 6 0 0 0 129 16 V94 A6 6 0 0 0 124 99 H16 A6 6 0 0 0 11 94 V16 A6 6 0 0 0 16 11 Z" className="stamp__line--light" />
        </>
      )
    case 'octagon':
      return (
        <>
          <polygon points="40,3 100,3 137,32 137,78 100,107 40,107 3,78 3,32" className="stamp__line--heavy" />
          <polygon points="42,9 98,9 131,35 131,75 98,101 42,101 9,75 9,35" className="stamp__line--light" />
        </>
      )
    case 'banner':
      // A ribbon with a V cut into each end, for supplier fairs.
      return (
        <>
          <path d="M3 12 H137 L121 55 L137 98 H3 L19 55 Z" className="stamp__line--heavy" />
          <path d="M11.6 18 H128.4 L114.6 55 L128.4 92 H11.6 L25.4 55 Z" className="stamp__line--light" />
        </>
      )
    case 'shield':
      // A crest, for Hub courses.
      return (
        <>
          <path d="M8 6 H132 V44 C132 74 104 94 70 106 C36 94 8 74 8 44 Z" className="stamp__line--heavy" />
          <path d="M14 12 H126 V44 C126 70 100 88 70 99 C40 88 14 70 14 44 Z" className="stamp__line--light" />
        </>
      )
    case 'diamond':
      // On its point, for Club Express.
      return (
        <>
          <polygon points="70,3 137,55 70,107 3,55" className="stamp__line--heavy" />
          <polygon points="70,11 129,55 70,99 11,55" className="stamp__line--light" />
        </>
      )
  }
}

export function Stamp({ stamp, repEmail, landing = false }: Props) {
  const look = stampLook(stamp.activity, stamp.supplier, repEmail, stamp.id)
  const { lines, ruleY } = layoutFor(stamp, look.shape)
  const ref = useRef<SVGSVGElement>(null)
  const words = lines.map((l) => l.text).join('|')

  // Measure every line once it's drawn. Anything wider than its room gets
  // squeezed to fit with textLength, so a long name or a wider fallback font
  // never runs over the stamp's border. Runs again once web fonts settle.
  useLayoutEffect(() => {
    const svg = ref.current
    if (!svg) return
    const fit = () => {
      for (const text of svg.querySelectorAll<SVGTextElement>('text[data-room]')) {
        text.removeAttribute('textLength')
        text.removeAttribute('lengthAdjust')
        const room = Number(text.dataset.room)
        if (text.getComputedTextLength() > room) {
          text.setAttribute('textLength', String(room))
          text.setAttribute('lengthAdjust', 'spacingAndGlyphs')
        }
      }
    }
    fit()
    let live = true
    document.fonts?.ready.then(() => live && fit())
    return () => {
      live = false
    }
  }, [words])

  // Make sure the stamp is on screen when it lands, with room above it for
  // the stamper coming down, and the endorsement that writes in under it a
  // moment later too, both clear of the sticky page bar on a phone. A jump,
  // not a smooth scroll, and only when it's needed: centring a stamp that
  // was already in view made the page lurch as the stamper arrived. On a
  // short screen (200% zoom, a phone on its side) the endorsement used to
  // land under the bar.
  useEffect(() => {
    const el = ref.current
    if (!landing || !el) return
    const box = el.getBoundingClientRect()
    const bar = document.querySelector('.passport__controls')
    const floor = Math.min(window.innerHeight, bar && getComputedStyle(bar).position === 'sticky' ? bar.getBoundingClientRect().top - BAR_GAP : Infinity)
    const note = el.closest('.page')?.querySelector('.visa__endorse')
    const top = box.top - STAMPER_ROOM
    const bottom = Math.max(box.bottom, note?.getBoundingClientRect().bottom ?? -Infinity)
    if (top >= 0 && bottom <= floor) return
    // All of it fits: scroll just far enough. Stamp and endorsement fit but
    // not the stamper's full swing: sit the endorsement on the bar and give
    // the stamper what's left. Neither: the stamp wins.
    if (bottom - top <= floor) window.scrollBy(0, top < 0 ? top : bottom - floor)
    else if (bottom - box.top <= floor) window.scrollBy(0, bottom - floor)
    else el.scrollIntoView({ block: 'center' })
  }, [landing])

  return (
    <svg
      ref={ref}
      className={`stamp stamp--ink-${look.ink} stamp--${look.shape}${landing ? ' is-landing' : ''}`}
      viewBox={`0 0 ${W} ${H}`}
      style={{ '--tilt': `${look.rotate}deg` } as CSSProperties}
      aria-hidden="true"
    >
      <g className="stamp__shape">
        <Shape shape={look.shape} />
      </g>
      {lines.map((line, i) => (
        <text
          key={i}
          x={W / 2}
          y={line.y}
          className={line.kind === 'name' ? 'stamp__name' : 'stamp__sub'}
          style={{ fontSize: line.size }}
          textAnchor="middle"
          data-room={line.room}
        >
          {line.text}
        </text>
      ))}
      <line x1={W / 2 - 24} x2={W / 2 + 24} y1={ruleY} y2={ruleY} className="stamp__line--light" />
    </svg>
  )
}
