// How each stamp looks. A training's shape and ink come from its supplier, so
// every Zebra stamp matches. Fairs, Hub courses and Club Express each have a
// shape of their own, so a page reads at a glance. The tilt comes from a seed
// so it looks hand-stamped but never jumps around between reloads.

import { SUPPLIERS, type Activity } from '../config'
import { hashString, unitFor } from './random'

export const STAMP_SHAPES = ['circle', 'rect', 'oval', 'hexagon', 'ticket', 'octagon'] as const
export const STAMP_INKS = 3
export type StampShape = (typeof STAMP_SHAPES)[number] | 'banner' | 'shield' | 'diamond'

export interface StampLook {
  shape: StampShape
  ink: 1 | 2 | 3
  rotate: number // degrees
}

const MAX_TILT = 9

// Each of the other activities gets one shape and one ink, the same for every rep.
const ACTIVITY_LOOK: Partial<Record<Activity, Pick<StampLook, 'shape' | 'ink'>>> = {
  fair: { shape: 'banner', ink: 2 },
  hub: { shape: 'shield', ink: 1 },
  club: { shape: 'diamond', ink: 3 },
}

// Six shapes and three inks make 18 training looks. Stepping the ink by one
// extra each time the shapes come round again means no two of the first 18
// suppliers share a shape and ink, so new ones go at the end of the list.
// A supplier we've never heard of still gets a stable look from its name.
export function stampLook(activity: Activity, supplier: string, repEmail: string, stampId: string): StampLook {
  const tilt = unitFor(`${repEmail}|${stampId}`, 0x5a17) * 2 - 1
  const rotate = Math.round(tilt * MAX_TILT * 10) / 10
  const fixed = ACTIVITY_LOOK[activity]
  if (fixed) return { ...fixed, rotate }
  const listed = (SUPPLIERS as readonly string[]).indexOf(supplier)
  const index = listed === -1 ? hashString(supplier) % 12 : listed
  const shape = STAMP_SHAPES[index % STAMP_SHAPES.length]
  const ink = (((index + Math.floor(index / STAMP_SHAPES.length)) % STAMP_INKS) + 1) as StampLook['ink']
  return { shape, ink, rotate }
}
