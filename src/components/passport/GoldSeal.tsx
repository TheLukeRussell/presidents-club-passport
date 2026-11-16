// The two gold seals. The quota seal is scalloped with a star in the middle:
// small on the inside cover and the data page, big on the seal page. The
// President's Club seal goes on the front cover once all five minimums are
// met, so it looks different on purpose: a sunburst edge, and a laurel
// wreath round a globe, because the trip is the point. Before either is
// earned it's a blind ring pressed where it will go: no colour, just a dent.
// The gold is a stencil filled with the cover's foil ramp, the same trick as
// the logo on the back cover, so it glints with the rest of the foil when
// the book is held or a page turns. That's why the gold layer is a
// .cover__mark: useTilt.ts lights every .cover__mark that's showing.

import type { CSSProperties } from 'react'
import { FISCAL_YEAR } from '../../config'
import './Cover.css'
import './GoldSeal.css'

const SCALLOPS = 36
const JOIN = 90 // where two scallops meet, in a 200 wide box centred on 0
const TEXT = `PRESIDENT’S CLUB · ${FISCAL_YEAR} · QUOTA ACHIEVED · `
const CLUB_TEXT = `PRESIDENT’S CLUB · QUALIFIED · ${FISCAL_YEAR} · `
const RAYS = 40 // points on the President's Club seal's sunburst edge

const pt = (r: number, a: number) => `${(r * Math.cos(a)).toFixed(2)} ${(r * Math.sin(a)).toFixed(2)}`

// The scalloped edge: a ring of shallow arcs bulging out between points on
// a circle, like the rim of a foil certificate seal.
function edge(): string {
  const step = (Math.PI * 2) / SCALLOPS
  const bump = (JOIN * Math.sin(step / 2) * 1.12).toFixed(2)
  let d = `M${pt(JOIN, -Math.PI / 2)}`
  for (let i = 1; i <= SCALLOPS; i++) d += `A${bump} ${bump} 0 0 1 ${pt(JOIN, -Math.PI / 2 + i * step)}`
  return `${d}Z`
}

// The President's Club seal's edge: a sunburst of short points, so it never
// reads as the scalloped quota seal, even small.
function sunburst(): string {
  let d = ''
  for (let i = 0; i < RAYS * 2; i++) d += `${i ? 'L' : 'M'}${pt(i % 2 ? 86 : 94, -Math.PI / 2 + (i * Math.PI) / RAYS)}`
  return `${d}Z`
}

// A five-point star, point up.
function star(outer: number, inner: number): string {
  let d = ''
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    d += `${i ? 'L' : 'M'}${pt(i % 2 ? inner : outer, a)}`
  }
  return `${d}Z`
}

const svg = (body: string) =>
  `<svg xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink' viewBox='-100 -100 200 200'>${body}</svg>`
const uri = (text: string) => `url("data:image/svg+xml,${encodeURIComponent(text)}")`

// The whole seal's outline. The gold fills it.
const SHAPE = uri(svg(`<path d='${edge()}'/>`))

// The engraving, printed in darker gold over the foil. The big seal gets the
// lettering on a circle; on the small one it would only be grain, so it gets
// a beaded ring in its place.
function engraving(lettered: boolean): string {
  const rings = lettered
    ? `<g fill='none' stroke='black'><circle r='85' stroke-width='1.5'/><circle r='79' stroke-width='1.25'/><circle r='56' stroke-width='1.25'/><circle r='50' stroke-width='0.75'/></g>`
    : `<g fill='none' stroke='black'><circle r='83' stroke-width='4'/><circle r='68' stroke-width='9' stroke-dasharray='3 4.1'/><circle r='53' stroke-width='4'/></g>`
  // The lettering starts at nine o'clock and runs clockwise, turned a little
  // so PRESIDENT’S CLUB sits centred across the top.
  const words = lettered
    ? `<path id='t' fill='none' d='M-64 0A64 64 0 1 1 64 0A64 64 0 1 1 -64 0'/><text transform='rotate(23)' font-family='Helvetica Neue, Helvetica, Arial, sans-serif' font-weight='700' font-size='12.5'><textPath xlink:href='#t' textLength='398' lengthAdjust='spacing'>${TEXT}</textPath></text>`
    : ''
  return uri(svg(`${rings}${words}<path d='${star(lettered ? 34 : 38, lettered ? 13.5 : 15.5)}'/>`))
}
const ENGRAVING = { small: engraving(false), large: engraving(true) }

// Laurel leaves up both sides of a circle, tips leaning toward the top,
// with a gap at the top and the bottom like a real wreath.
function laurel(r: number): string {
  let out = ''
  for (const side of [-1, 1]) {
    for (let i = 0; i < 7; i++) {
      // From near the bottom (about 7 o'clock) up toward the top (about 11).
      const a = Math.PI / 2 + side * (0.42 + i * 0.36)
      const x = (r * Math.cos(a)).toFixed(2)
      const y = (r * Math.sin(a)).toFixed(2)
      const tilt = ((a * 180) / Math.PI + (side === 1 ? 90 : -90) - side * 28).toFixed(1)
      out += `<ellipse cx='${x}' cy='${y}' rx='6.2' ry='2.6' transform='rotate(${tilt} ${x} ${y})'/>`
    }
  }
  return out
}

// The President's Club engraving: rings, the lettering turned so PRESIDENT’S
// CLUB sits across the top, and the wreath round a globe in the middle.
const CLUB_SHAPE = uri(svg(`<path d='${sunburst()}'/>`))
const CLUB_ENGRAVING = uri(
  svg(
    `<g fill='none' stroke='black'><circle r='80' stroke-width='1.5'/><circle r='74' stroke-width='1'/><circle r='52' stroke-width='1.25'/><circle r='47' stroke-width='0.75'/></g>` +
      `<path id='t' fill='none' d='M-62 0A62 62 0 1 1 62 0A62 62 0 1 1 -62 0'/><text transform='rotate(14)' font-family='Helvetica Neue, Helvetica, Arial, sans-serif' font-weight='700' font-size='12'><textPath xlink:href='#t' textLength='386' lengthAdjust='spacing'>${CLUB_TEXT}</textPath></text>` +
      laurel(35) +
      `<g fill='none' stroke='black' stroke-width='2'><circle r='19'/><ellipse rx='8' ry='19'/><path d='M-19 0H19M-16.5 -9.5H16.5M-16.5 9.5H16.5'/></g>`,
  ),
)

interface Props {
  size: 'small' | 'large'
  // Which seal: the quota's (the default) or the President's Club seal for
  // the front cover. The cover sets its own size.
  kind?: 'quota' | 'club'
  // Not pressed yet: the blind ring that marks where it goes.
  blind?: boolean
  // Names the seal for screen readers. Without one it's decoration.
  label?: string
  className?: string
}

export function GoldSeal({ size, kind = 'quota', blind = false, label, className }: Props) {
  const name = `gold-seal gold-seal--${size} gold-seal--${kind}${blind ? ' gold-seal--blind' : ''}${className ? ` ${className}` : ''}`
  if (blind) {
    return (
      <span className={name} aria-hidden="true">
        <span className="gold-seal__ring" />
      </span>
    )
  }
  const look = (
    kind === 'club' ? { '--seal-shape': CLUB_SHAPE, '--seal-engraving': CLUB_ENGRAVING } : { '--seal-shape': SHAPE, '--seal-engraving': ENGRAVING[size] }
  ) as CSSProperties
  return (
    <span className={name} style={look} {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}>
      <span className="gold-seal__shadow" />
      <span className="gold-seal__foil cover__mark" />
      <span className="gold-seal__engraving" />
    </span>
  )
}
