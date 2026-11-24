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

// If storage can't be written (blocked, or full), the answer lasts for this
// visit only.
let memory: Consent | null = null
let unsaved = false

export function setConsent(value: 'granted' | 'denied') {
  memory = value
  try {
    window.localStorage.setItem(KEY, value)
    unsaved = false
  } catch {
    // Blocked or full: memory has it for now.
    unsaved = true
  }
  notify()
}

// The stored answer wins, so a "No thanks" in another tab counts here too.
// The in-memory answer is only for when storage is blocked.
function readable(): boolean {
  try {
    window.localStorage.getItem(KEY)
    return true
  } catch {
    return false
  }
}
export const consentNow = (): Consent => {
  if (typeof window === 'undefined') return 'pending'
  return readable() && !unsaved ? storedConsent() : (memory ?? 'pending')
}

// Hears about every change: from this tab's banner, or another tab's.
export function onConsentChange(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === KEY || event.key === null) notify()
  })
}
