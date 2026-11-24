// Whether this visitor has agreed to analytics. Nothing reaches PostHog, and
// posthog-js isn't even downloaded, until the answer is yes.
//
// Two ways to ask:
//   - OneTrust, when its script is on the page (see the hook in index.html).
//     It owns the banner and the answer: analytics is on when the group in
//     config.js (onetrustAnalyticsGroup, C0002 "Performance" by default) is
//     one of OnetrustActiveGroups.
//   - Otherwise the passport's own small banner (ConsentBanner), with the
//     answer kept in localStorage under its own key.

import { runtime } from '../runtime'

export type Consent = 'granted' | 'denied' | 'pending'

declare global {
  interface Window {
    // Set by OneTrust: a comma list of the groups the visitor allows, like ",C0001,C0002,".
    OnetrustActiveGroups?: string
    // OneTrust calls this when it loads and every time the visitor changes their choice.
    OptanonWrapper?: () => void
    OneTrust?: unknown
  }
}

const KEY = 'pcp-consent-v1'
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((listener) => listener())

export const usesOneTrust = () => typeof window !== 'undefined' && (window.OneTrust !== undefined || typeof window.OnetrustActiveGroups === 'string')

function oneTrustConsent(): Consent {
  const groups = window.OnetrustActiveGroups
  if (typeof groups !== 'string') return 'pending'
  return groups.split(',').includes(runtime.onetrustGroup) ? 'granted' : 'denied'
}

function storedConsent(): Consent {
  try {
    const value = window.localStorage.getItem(KEY)
    return value === 'granted' || value === 'denied' ? value : 'pending'
  } catch {
    // Storage blocked: ask every visit, and never assume yes.
    return 'pending'
  }
}

export function currentConsent(): Consent {
  if (typeof window === 'undefined') return 'pending'
  return usesOneTrust() ? oneTrustConsent() : storedConsent()
}

// The passport's own banner records the answer here. With OneTrust on the
// page this does nothing: OneTrust's answer is the one that counts.
// If storage is blocked, the answer lasts for this visit only.
let memory: Consent | null = null

export function setConsent(value: 'granted' | 'denied') {
  if (usesOneTrust()) return
  memory = value
  try {
    window.localStorage.setItem(KEY, value)
  } catch {
    // Blocked: memory has it for now.
  }
  notify()
}

export const consentNow = (): Consent => (usesOneTrust() ? oneTrustConsent() : (memory ?? currentConsent()))

// Hears about every change, from the banner or from OneTrust.
export function onConsentChange(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// The OneTrust hook. Chains onto OptanonWrapper (keeping whatever was there)
// and listens for its OneTrustGroupsUpdated event, so a change made in
// OneTrust's own preference centre switches analytics on or off at once.
if (typeof window !== 'undefined') {
  const previous = window.OptanonWrapper
  window.OptanonWrapper = () => {
    previous?.()
    notify()
  }
  window.addEventListener('OneTrustGroupsUpdated', notify)
}
