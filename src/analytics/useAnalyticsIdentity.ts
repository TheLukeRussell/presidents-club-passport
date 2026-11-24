// Keeps PostHog's idea of who's here in step with Supabase sign-in: a
// signed-in rep is identified by their Supabase user id (with their team,
// nothing personal), signing out forgets them, and signed_in is sent once
// for each real sign-in, not for a reload or a tab regaining focus.

import { useEffect, useRef } from 'react'
import { useApp } from '../state/AppState'
import { useAuth } from '../state/Auth'
import { forgetIdentity, identify, track } from './posthog'

export function useAnalyticsIdentity() {
  const { live, ready } = useApp()
  const { userId, signedInBy, status } = useAuth()
  const team = live ? (ready?.viewAs.team ?? null) : null

  useEffect(() => {
    if (userId) identify(userId, team ? { team } : {})
  }, [userId, team])

  // Signed out, here or because the session ran out: forget them, so the
  // next person on this browser isn't counted as them. A sign-out also
  // means the next sign-in, even by the same rep, is a new signed_in.
  const announced = useRef<string | null>(null)
  useEffect(() => {
    if (live && status === 'signed-out') {
      forgetIdentity()
      announced.current = null
    }
  }, [live, status])

  useEffect(() => {
    if (!userId || !signedInBy || announced.current === userId) return
    announced.current = userId
    track('signed_in', { method: signedInBy })
  }, [userId, signedInBy])
}
