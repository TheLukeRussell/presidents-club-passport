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
import { currentSession, forgetSignInCode, onAuthChange, signOut as endSession } from '../data/live'
import { runtime } from '../runtime'

export type AuthStatus = 'off' | 'checking' | 'signed-out' | 'signed-in'

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
}

const AuthContext = createContext<AuthValue | null>(null)

// Read once, before anything tidies the address bar.
const openedFromLink = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('code')

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

export function AuthProvider({ children }: { children: ReactNode }) {
  const live = runtime.mode === 'live'
  const [status, setStatus] = useState<AuthStatus>(live ? 'checking' : 'off')
  const [userId, setUserId] = useState<string | null>(null)
  const [email, setEmail] = useState<string | null>(null)
  const [linkProblem, setLinkProblem] = useState<string | null>(linkError)
  const [signedInBy, setSignedInBy] = useState<AuthValue['signedInBy']>(null)
  const byCode = useRef(false)
  const current = useRef<string | null>(null)

  useEffect(() => {
    if (!live) return
    let cancelled = false
    // Supabase swaps a ?code= for a session as it starts up, and
    // getSession waits for that.
    currentSession()
      .then((session) => {
        if (cancelled) return
        if (session) {
          current.current = session.user.id
          setUserId(session.user.id)
          setEmail(session.user.email ?? null)
          setStatus('signed-in')
          if (openedFromLink) setSignedInBy('link')
        } else {
          setStatus('signed-out')
          if (openedFromLink) {
            setLinkProblem(
              'That sign-in link didn’t work here. It only works in the browser you asked for it in, and only once. Type the 6-digit code from the same email instead, or ask for a new one.',
            )
          }
        }
      })
      .catch(() => {
        if (!cancelled) setStatus('signed-out')
      })
      .finally(forgetSignInCode)

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
      if (current.current !== session.user.id) {
        current.current = session.user.id
        if (byCode.current) setSignedInBy('code')
      }
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
  }, [live])

  const noteCodeSignIn = useCallback((trying: boolean) => {
    byCode.current = trying
  }, [])

  const signOut = useCallback(async () => {
    try {
      await endSession()
    } finally {
      current.current = null
      setUserId(null)
      setEmail(null)
      setSignedInBy(null)
      setStatus('signed-out')
    }
  }, [])

  return (
    <AuthContext.Provider value={{ status, userId, email, linkProblem, signedInBy, noteCodeSignIn, signOut }}>{children}</AuthContext.Provider>
  )
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth needs to sit inside <AuthProvider>')
  return value
}
