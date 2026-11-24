// Who's signed in, for the live passport. In the demo there's no sign-in at
// all (status 'off'), so nothing here runs and the demo works as it always
// has.
//
// A rep signs in one of two ways, from the same email: the link, which
// brings them back here with ?code= in the address, or the 6-digit code,
// typed into the sign-in screen. The code is there because a link only
// works in the browser that asked for it, and some work email scanners
// click links before the rep does, which uses them up.

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { currentSession, forgetSignInCode, onAuthChange, signOut as endSession, storedUserId } from '../data/live'
import { runtime } from '../runtime'

// 'unavailable': the sign-in service couldn't be reached (or its code didn't
// download), so it isn't known yet whether anyone is signed in.
export type AuthStatus = 'off' | 'checking' | 'signed-out' | 'signed-in' | 'unavailable'

export interface AuthValue {
  status: AuthStatus
  userId: string | null // the Supabase user id; PostHog uses this, never the email
  email: string | null
  // Set when the page opened from an email link that didn't sign them in
  // (opened in another browser, already used, or expired).
  linkProblem: string | null
  // How this page's sign-in happened, once: 'link' or 'code'. Null for a
  // session that was already there (a reload, a new tab).
  signedInBy: 'link' | 'code' | null
  // The sign-in screen calls this with true just before it checks a code,
  // and false if the code was wrong, so a code sign-in can be told apart
  // from a session that was already there.
  noteCodeSignIn: (trying: boolean) => void
  signOut: () => Promise<void>
  // Tries the sign-in service again after 'unavailable'.
  retry: () => void
  // Goes up by one each time someone signs in, the same rep again
  // included, so anything tied to one sign-in (like a load error) can tell
  // a fresh one from the last.
  signIns: number
}

const AuthContext = createContext<AuthValue | null>(null)

// Whether the page was opened from an email link: a ?code= is waiting in
// the address for Supabase to swap for a session.
const hasSignInCode = () => typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('code')
const openedFromLink = hasSignInCode()

// When an email link fails (expired, already used), Supabase sends the rep
// back with the reason in the address: ?error=... and, for older links,
// #error=...&sb= after the #. The router owns the # and would quietly throw
// that away as an unknown page, so read it and tidy it up first, before the
// router or Supabase sees it. Runs once, as the app loads.
function takeLinkError(): string | null {
  const url = new URL(window.location.href)
  const hash = new URLSearchParams(url.hash.replace(/^#/, ''))
  const inHash = hash.has('error') || hash.has('error_code')
  const code = url.searchParams.get('error_code') ?? (inHash ? hash.get('error_code') : null)
  const error = url.searchParams.get('error') ?? (inHash ? hash.get('error') : null)
  if (!code && !error) return null
  for (const key of ['error', 'error_code', 'error_description', 'sb']) url.searchParams.delete(key)
  if (inHash) url.hash = ''
  window.history.replaceState(window.history.state, '', url)
  return code === 'otp_expired'
    ? 'That sign-in link has expired or was already used. Links work once, for a short time. Ask for a new one below, or type the 6-digit code from the newest email.'
    : 'That sign-in link didn’t work. Ask for a new one below, or type the 6-digit code from the email.'
}
const linkError = typeof window !== 'undefined' && runtime.mode === 'live' ? takeLinkError() : null
// Who was signed in before this page's email link was used, if anyone. A
// link that fails leaves that session in place, which isn't a new sign-in.
const signedInBefore = typeof window !== 'undefined' && runtime.mode === 'live' && openedFromLink ? storedUserId() : null

export function AuthProvider({ children }: { children: ReactNode }) {
  const live = runtime.mode === 'live'
  const [status, setStatus] = useState<AuthStatus>(live ? 'checking' : 'off')
  const [userId, setUserId] = useState<string | null>(null)
  const [email, setEmail] = useState<string | null>(null)
  const [linkProblem, setLinkProblem] = useState<string | null>(linkError)
  const [signedInBy, setSignedInBy] = useState<AuthValue['signedInBy']>(null)
  const byCode = useRef(false)
  const current = useRef<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [signIns, setSignIns] = useState(0)
  // A new sign-in: someone signed in who wasn't a moment ago.
  const signedIn = (id: string) => {
    if (current.current === id) return false
    current.current = id
    setSignIns((n) => n + 1)
    return true
  }

  useEffect(() => {
    if (!live) return
    let cancelled = false
    // Read now rather than once at load: if the first try couldn't reach
    // Supabase, the code is still there for Try again to use.
    const fromLink = hasSignInCode()
    // Supabase swaps a ?code= for a session as it starts up, and
    // getSession waits for that.
    currentSession()
      .then((session) => {
        if (cancelled) return
        // The code has done its job either way now, so take it out of the
        // address (and out of anything that reads the URL later).
        forgetSignInCode()
        if (session) {
          signedIn(session.user.id)
          setUserId(session.user.id)
          setEmail(session.user.email ?? null)
          setStatus('signed-in')
          // Only a session the link really made counts as signing in by link.
          if (fromLink && session.user.id !== signedInBefore) setSignedInBy('link')
        } else {
          setStatus('signed-out')
          if (fromLink) {
            setLinkProblem(
              'That sign-in link didn’t work here. It only works in the browser you asked for it in, and only once. Type the 6-digit code from the same email instead, or ask for a new one.',
            )
          }
        }
      })
      .catch(() => {
        // Supabase couldn't be reached, so the code (if any) is kept for a retry.
        if (!cancelled) setStatus('unavailable')
      })

    // Sign-ins with the code, sign-outs (here or in another tab) and token
    // refreshes. Supabase also reports SIGNED_IN when a tab regains focus, so
    // this only updates who's signed in; signedInBy says when it was new.
    const stop = onAuthChange((event, session) => {
      if (cancelled) return
      if (event === 'SIGNED_OUT' || !session) {
        current.current = null
        setUserId(null)
        setEmail(null)
        setSignedInBy(null)
        setStatus('signed-out')
        return
      }
      if (signedIn(session.user.id) && byCode.current) setSignedInBy('code')
      byCode.current = false
      setUserId(session.user.id)
      setEmail(session.user.email ?? null)
      setLinkProblem(null)
      setStatus('signed-in')
    })
    return () => {
      cancelled = true
      stop()
    }
  }, [live, attempt])

  const retry = useCallback(() => {
    setStatus('checking')
    setAttempt((n) => n + 1)
  }, [])

  const noteCodeSignIn = useCallback((trying: boolean) => {
    byCode.current = trying
  }, [])

  // Never throws: signing out here always ends the session in this browser
  // (see live.ts), even if telling the server fails.
  const signOut = useCallback(async () => {
    try {
      await endSession()
    } catch {
      // Already signed out locally; the server will expire the session.
    } finally {
      current.current = null
      setUserId(null)
      setEmail(null)
      setSignedInBy(null)
      setStatus('signed-out')
    }
  }, [])

  return (
    <AuthContext.Provider value={{ status, userId, email, linkProblem, signedInBy, noteCodeSignIn, signOut, retry, signIns }}>{children}</AuthContext.Provider>
  )
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth needs to sit inside <AuthProvider>')
  return value
}
