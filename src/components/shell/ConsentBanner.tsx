// The passport's own cookie question, for when OneTrust isn't on the page.
// It only appears when PostHog is set up in config.js, and nothing is sent
// to PostHog until someone says yes. Once they've answered, a small
// "Analytics settings" link at the foot of the page lets them change it.
// With OneTrust on the page, OneTrust asks instead and this stays out of the way.

import { useState, useSyncExternalStore } from 'react'
import { consentNow, onConsentChange, setConsent, usesOneTrust, type Consent } from '../../analytics/consent'
import { runtime } from '../../runtime'
import './ConsentBanner.css'

const subscribe = (listener: () => void) => {
  const stop = onConsentChange(listener)
  return () => void stop()
}
const pending = (): Consent => 'pending'

export function ConsentBanner() {
  const consent = useSyncExternalStore(subscribe, consentNow, pending)
  const [reopened, setReopened] = useState(false)
  if (!runtime.posthog || usesOneTrust()) return null

  const answer = (value: 'granted' | 'denied') => {
    setConsent(value)
    setReopened(false)
  }

  if (consent === 'pending' || reopened) {
    return (
      <section className="consent" aria-labelledby="consent-title">
        <div className="consent__inner container">
          <div className="consent__text">
            <h2 id="consent-title" className="consent__title">
              Help improve the passport?
            </h2>
            <p>
              With your OK, the passport counts which pages and stamps get opened, so we can see what’s useful. It stores an anonymous ID in this
              browser. Nothing is used for ads, and your email is never sent.
            </p>
          </div>
          <div className="consent__actions">
            <button type="button" className="btn" onClick={() => answer('granted')}>
              Allow analytics
            </button>
            <button type="button" className="btn btn--quiet" onClick={() => answer('denied')}>
              No thanks
            </button>
          </div>
        </div>
      </section>
    )
  }

  return (
    <footer className="consent-foot container">
      <button type="button" className="link-btn consent-foot__link" onClick={() => setReopened(true)}>
        Analytics settings ({consent === 'granted' ? 'on' : 'off'})
      </button>
    </footer>
  )
}
