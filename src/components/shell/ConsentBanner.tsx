// The passport's cookie question. It only appears when PostHog is set up in
// config.js, and nothing is sent to PostHog until someone says yes. Once
// they've answered, a small "Analytics settings" link at the foot of the
// page lets them change it.
//
// While it's showing, the page keeps room for it at the bottom (the
// --consent-space variable), so it never covers the passport's page
// controls or a form's buttons. Focus moves with it: to the question when
// it's reopened, and to the settings link once it's answered.

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { consentNow, onConsentChange, setConsent, type Consent } from '../../analytics/consent'
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
  const banner = useRef<HTMLElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const link = useRef<HTMLButtonElement>(null)
  // Where focus goes after the next render, if anywhere.
  const focusNext = useRef<'heading' | 'link' | null>(null)
  const showing = runtime.posthog !== null && (consent === 'pending' || reopened)

  useEffect(() => {
    const target = focusNext.current
    if (!target) return
    focusNext.current = null
    // preventScroll: moving focus mustn't jump the page down to the footer.
    ;(target === 'heading' ? heading : link).current?.focus({ preventScroll: true })
  })

  // Keep room for the banner while it shows, and follow its height as it
  // wraps on a narrow screen.
  useLayoutEffect(() => {
    const root = document.documentElement
    const element = banner.current
    if (!showing || !element) {
      root.style.removeProperty('--consent-space')
      return
    }
    const update = () => root.style.setProperty('--consent-space', `${Math.ceil(element.getBoundingClientRect().height)}px`)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => {
      observer.disconnect()
      root.style.removeProperty('--consent-space')
    }
  }, [showing])

  if (!runtime.posthog) return null

  const answer = (value: 'granted' | 'denied') => {
    focusNext.current = 'link'
    setConsent(value)
    setReopened(false)
  }

  if (showing) {
    return (
      <section ref={banner} className="consent" aria-labelledby="consent-title">
        <div className="consent__inner container">
          <div className="consent__text">
            <h2 id="consent-title" ref={heading} className="consent__title" tabIndex={-1}>
              Help improve the passport?
            </h2>
            <p>
              {runtime.mode === 'live'
                ? 'With your OK, the passport counts which pages and stamps you open, so we can see what’s useful. It stores an ID in this browser, and while you’re signed in it’s linked to your passport account (never your email). Nothing is used for ads.'
                : 'With your OK, the passport counts which pages and stamps get opened, so we can see what’s useful. It stores an anonymous ID in this browser. Nothing is used for ads.'}
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
      <button
        ref={link}
        type="button"
        className="link-btn consent-foot__link"
        onClick={() => {
          focusNext.current = 'heading'
          setReopened(true)
        }}
      >
        Analytics settings ({consent === 'granted' ? 'on' : 'off'})
      </button>
    </footer>
  )
}
