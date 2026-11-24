// The live passport's front door: enter your work email, get an email with a
// sign-in link and a 6-digit code, and use either. No passwords. Only reps on
// the President's Club roster have an account to sign in to (the attendance
// importer makes them), and once in, a rep only ever sees their own passport.

import { useState, type FormEvent } from 'react'
import { sendSignInEmail, verifySignInCode } from '../../data/live'
import { useAuth } from '../../state/Auth'
import './SignIn.css'

type Step = { at: 'email' } | { at: 'code'; email: string }

// Supabase's messages are written for developers. Say what happened in
// plain words, and keep theirs only when it's already plain.
function explain(error: unknown, sending: boolean): string {
  const message = error instanceof Error ? error.message : String(error ?? '')
  if (/roster/i.test(message)) return message
  if (/rate limit|too many|security purposes|only request this after/i.test(message)) {
    return 'Too many sign-in emails just now. Wait a minute, then try again.'
  }
  // Supabase's built-in email only sends to the project's own team, two an
  // hour, until the project has its own email provider (README).
  if (/not authorized/i.test(message)) {
    return 'The passport can’t email that address yet: its email service is still in test mode. Ask the program team.'
  }
  if (/expired|invalid|otp/i.test(message) && !sending) return 'That code didn’t work. It may have expired: codes last an hour, and only the newest one works.'
  if (/fetch|network/i.test(message)) return 'Couldn’t reach the sign-in service. Check the connection and try again.'
  if (/signups not allowed|not allowed for this instance/i.test(message)) {
    return 'That email isn’t set up for the passport yet. Ask the program team to add you.'
  }
  return message || 'Something went wrong. Try again.'
}

export function SignIn() {
  const { linkProblem, noteCodeSignIn } = useAuth()
  const [step, setStep] = useState<Step>({ at: 'email' })
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  const send = async (event?: FormEvent) => {
    event?.preventDefault()
    const address = email.trim().toLowerCase()
    if (!address.includes('@')) return setProblem('Enter your work email address.')
    setBusy(true)
    setProblem(null)
    try {
      await sendSignInEmail(address)
      setStep({ at: 'code', email: address })
      setCode('')
    } catch (error) {
      setProblem(explain(error, true))
    } finally {
      setBusy(false)
    }
  }

  const verify = async (event: FormEvent) => {
    event.preventDefault()
    if (step.at !== 'code') return
    const token = code.replace(/\D/g, '')
    if (token.length < 6) return setProblem('Enter the 6-digit code from the email.')
    setBusy(true)
    setProblem(null)
    noteCodeSignIn(true)
    try {
      // Success signs them in through Auth's listener, which swaps this
      // screen for their passport.
      await verifySignInCode(step.email, token)
    } catch (error) {
      noteCodeSignIn(false)
      setProblem(explain(error, false))
      setBusy(false)
    }
  }

  return (
    <div className="container">
      <section className="state signin" aria-labelledby="signin-title">
        <h1 id="signin-title" className="state__title">
          Sign in to your passport
        </h1>

        {step.at === 'email' ? (
          <>
            <p className="state__text">
              Enter your work email. We’ll send a sign-in link and a 6-digit code. Use whichever is easier.
            </p>
            {linkProblem && !problem && (
              <p className="signin__problem" role="alert">
                {linkProblem}
              </p>
            )}
            <form className="signin__form" onSubmit={send} noValidate>
              <div className="field">
                <label htmlFor="signin-email">Work email</label>
                <input
                  id="signin-email"
                  className="input"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  spellCheck={false}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={busy}
                  required
                />
              </div>
              <button type="submit" className="btn" disabled={busy} aria-busy={busy || undefined}>
                {busy ? 'Sending…' : 'Email me a sign-in link'}
              </button>
            </form>
          </>
        ) : (
          <>
            <p className="state__text">
              We sent an email to <strong>{step.email}</strong>. Open the link in it on this device, or type the 6-digit code here.
            </p>
            <form className="signin__form" onSubmit={verify} noValidate>
              <div className="field">
                <label htmlFor="signin-code">6-digit code</label>
                <input
                  id="signin-code"
                  className="input signin__code"
                  type="text"
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={10}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  disabled={busy}
                  autoFocus
                />
              </div>
              <button type="submit" className="btn" disabled={busy} aria-busy={busy || undefined}>
                {busy ? 'Checking…' : 'Sign in'}
              </button>
            </form>
            <p className="signin__again">
              Nothing yet? Check spam, or{' '}
              <button type="button" className="link-btn" onClick={() => send()} disabled={busy}>
                send another
              </button>
              {' · '}
              <button
                type="button"
                className="link-btn"
                onClick={() => {
                  setStep({ at: 'email' })
                  setProblem(null)
                }}
                disabled={busy}
              >
                use a different email
              </button>
            </p>
          </>
        )}

        {problem && (
          <p className="signin__problem" role="alert">
            {problem}
          </p>
        )}
      </section>
    </div>
  )
}
