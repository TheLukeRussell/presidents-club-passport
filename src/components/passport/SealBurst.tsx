// The burst when the President's Club seal lands on the cover: a ring of
// light, rays and foil flecks flying out from under the seal, then gone.
// Pure paint, transform and opacity only, and it never takes a click.
// The flecks are seeded, so the burst looks the same every time.

import type { CSSProperties } from 'react'
import { unitFor } from '../../lib/random'
import './SealBurst.css'

const FLECKS = 40
const RAYS = 20

// Where each fleck flies, in seal widths from the middle, how far it spins,
// how big it is and how late it leaves.
const flecks = Array.from({ length: FLECKS }, (_, i) => {
  const r = (n: number) => unitFor(`fleck|${i}|${n}`, 0x5ea1)
  const angle = (i / FLECKS) * Math.PI * 2 + (r(1) - 0.5) * 0.35
  const reach = 0.8 + r(2) * 1.1
  return {
    dx: Math.cos(angle) * reach,
    dy: Math.sin(angle) * reach,
    spin: Math.round((r(3) - 0.5) * 720),
    size: 0.5 + r(4) * 1.1,
    delay: Math.round(r(5) * 260),
    bright: r(6) > 0.6,
  }
})

const rays = Array.from({ length: RAYS }, (_, i) => (i / RAYS) * Math.PI * 2)

export function SealBurst() {
  return (
    <span className="seal-burst" aria-hidden="true">
      <span className="seal-burst__ring" />
      <span className="seal-burst__ring seal-burst__ring--late" />
      {/* Long and short rays in turn, like light off a coin. */}
      <svg className="seal-burst__rays" viewBox="-100 -100 200 200">
        {rays.map((a, i) => {
          const end = i % 2 ? 84 : 98
          return <line key={i} x1={Math.cos(a) * 60} y1={Math.sin(a) * 60} x2={Math.cos(a) * end} y2={Math.sin(a) * end} />
        })}
      </svg>
      {flecks.map((f, i) => (
        <span
          key={i}
          className={`seal-burst__fleck${f.bright ? ' is-bright' : ''}${i % 3 === 0 ? ' is-long' : ''}`}
          style={
            {
              '--dx': f.dx.toFixed(3),
              '--dy': f.dy.toFixed(3),
              '--spin': `${f.spin}deg`,
              '--size': f.size.toFixed(2),
              animationDelay: `calc(var(--burst-at) + ${f.delay}ms)`,
            } as CSSProperties
          }
        />
      ))}
    </span>
  )
}
