// passport_viewed: once each time a passport opens on the Passport screen.
// Keyed on the rep, not the page, so turning pages doesn't count again, and
// the ref keeps React's dev double-run from counting twice. Nothing that
// names the rep is sent: just where they stand and the page it opened on.

import { useEffect, useRef } from 'react'
import type { StandingRow } from '../lib/ranking'
import { track } from './posthog'

export function usePassportViewed(repId: string | undefined, board: StandingRow[], viewAsId: string, page: number) {
  const viewed = useRef<string | null>(null)
  useEffect(() => {
    if (!repId || viewed.current === repId) return
    viewed.current = repId
    const row = board.find((r) => r.rep.id === repId)
    track('passport_viewed', {
      own_passport: repId === viewAsId,
      minimums_met: row?.stats.met ?? 0,
      stamps_total: row?.stats.total ?? 0,
      qualified: row?.stats.qualified ?? false,
      status: row?.status ?? null,
      // The page it opened on: the effect reruns on page turns but stops at
      // the guard above, so only the first page is ever sent.
      opened_on_page: page,
    })
  }, [repId, board, viewAsId, page])
}
