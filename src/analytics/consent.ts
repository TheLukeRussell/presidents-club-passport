// Whether this visitor has agreed to analytics. Nothing reaches PostHog, and
// posthog-js isn't even downloaded, until the answer is yes. The passport's
// own small banner (ConsentBanner) asks, and the answer is kept in
// localStorage under its own key.

export type Consent = 'granted' | 'denied' | 'pending'

const KEY = 'pcp-consent-v1'
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((listener) => listener())

function storedConsent(): Consent {
  try {
    const value = window.localStorage.getItem(KEY)
    return value === 'granted' || value === 'denied' ? value : 'pending'
  } catch {
    // Storage blocked: ask every visit, and never assume yes.
    return 'pending'
  }
}

// If storage is blocked, the answer lasts for this visit only.
let memory: Consent | null = null

export function setConsent(value: 'granted' | 'denied') {
  memory = value
  try {
    window.localStorage.setItem(KEY, value)
  } catch {
    // Blocked: memory has it for now.
  }
  notify()
}

export const consentNow = (): Consent => (typeof window === 'undefined' ? 'pending' : (memory ?? storedConsent()))

// Hears about every change made with the banner.
export function onConsentChange(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
