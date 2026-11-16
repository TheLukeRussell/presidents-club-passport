// The gold quota seal: a scalloped foil seal with a ring of small capitals
// and a star in the middle. One design at two sizes, small on the cover and
// the inside cover, big on the seal page. Before quota lands it's a blind
// ring pressed where the seal will go: no colour, just a dent.
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

interface Props {
  size: 'small' | 'large'
  // Not pressed yet: the blind ring that marks where it goes.
  blind?: boolean
  // Names the seal for screen readers. Without one it's decoration.
  label?: string
  className?: string
}

export function GoldSeal({ size, blind = false, label, className }: Props) {
  const name = `gold-seal gold-seal--${size}${blind ? ' gold-seal--blind' : ''}${className ? ` ${className}` : ''}`
  if (blind) {
    return (
      <span className={name} aria-hidden="true">
        <span className="gold-seal__ring" />
      </span>
    )
  }
  const look = { '--seal-shape': SHAPE, '--seal-engraving': ENGRAVING[size] } as CSSProperties
  return (
    <span className={name} style={look} {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}>
      <span className="gold-seal__shadow" />
      <span className="gold-seal__foil cover__mark" />
      <span className="gold-seal__engraving" />
    </span>
  )
}
