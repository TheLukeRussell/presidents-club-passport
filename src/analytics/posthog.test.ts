// The clean-up every event goes through before it reaches PostHog: rep IDs
// (made from names) out of addresses, and the one-time sign-in code too.

import { describe, expect, it } from 'vitest'
import { scrubEvent, scrubUrl } from './posthog'

const SITE = 'https://example.github.io/presidents-club-passport/'

describe('scrubUrl', () => {
  it('swaps the rep in a passport route for :rep and keeps the page', () => {
    expect(scrubUrl(`${SITE}#/passport/hannah-kowalski?page=3`)).toBe(`${SITE}#/passport/:rep?page=3`)
    expect(scrubUrl(`${SITE}#/passport/jo-smith`)).toBe(`${SITE}#/passport/:rep`)
  })

  it('drops a sign-in code and keeps everything else', () => {
    expect(scrubUrl(`${SITE}?code=abc123&demo#/standings`)).toBe(`${SITE}?demo=#/standings`)
    expect(scrubUrl(`${SITE}?code=abc123`)).toBe(SITE)
  })

  it('leaves other addresses and non-strings alone', () => {
    expect(scrubUrl(`${SITE}#/standings?team=posb`)).toBe(`${SITE}#/standings?team=posb`)
    expect(scrubUrl('$direct')).toBe('$direct')
    expect(scrubUrl(null)).toBeNull()
    expect(scrubUrl(3)).toBe(3)
  })
})

describe('scrubEvent', () => {
  it('cleans every address on the event, whatever it’s called', () => {
    const event = scrubEvent({
      event: 'passport_viewed',
      properties: {
        $current_url: `${SITE}#/passport/hannah-kowalski?page=2`,
        $session_entry_url: `${SITE}?code=xyz#/passport/hannah-kowalski`,
        $initial_current_url: `${SITE}#/passport/hannah-kowalski`,
        $referrer: '$direct',
        $pathname: '/presidents-club-passport/',
        minimums_met: 3,
      },
      $set_once: { $initial_current_url: `${SITE}#/passport/hannah-kowalski` },
    })
    expect(JSON.stringify(event)).not.toMatch(/hannah|kowalski|code=/)
    expect(event.properties.$current_url).toBe(`${SITE}#/passport/:rep?page=2`)
    expect(event.properties.$session_entry_url).toBe(`${SITE}#/passport/:rep`)
    expect(event.properties.minimums_met).toBe(3)
  })

  it('passes a dropped event through as dropped', () => {
    expect(scrubEvent(null)).toBeNull()
  })
})
