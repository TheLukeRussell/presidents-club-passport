// PostHog for the passport: five events, nothing automatic, nothing before
// consent.
//
//   passport_viewed     a passport opens (once per rep per visit to the screen)
//   signed_in           a rep signs in, by link or code (not on reload)
//   stamp_viewed        a stamp's detail slip opens
//   activity_clicked    a checklist row is tapped to jump to that activity
//   passport_completed  a rep has all five minimums (once per rep per browser)
//
// posthog-js isn't downloaded until there's consent and a key in config.js.
// Events from before then are dropped, not queued. People are identified by
// their Supabase user id, never their email, and person profiles are only
// made for signed-in reps. Autocapture, pageviews, session replay, surveys,
// heatmaps, feature flags and outside scripts are all off here, whatever the
// project's own settings say.

import type { PostHog } from 'posthog-js'
import { runtime } from '../runtime'
import { consentNow, onConsentChange } from './consent'

export type PassportEvent = 'passport_viewed' | 'signed_in' | 'stamp_viewed' | 'activity_clicked' | 'passport_completed'
type Props = Record<string, string | number | boolean | null>

let posthog: PostHog | null = null
let starting: Promise<PostHog | null> | null = null
let identity: { userId: string; props: Props } | null = null

// Rep IDs in the address are made from their names (#/passport/hannah-kowalski),
// and a sign-in link carries a one-time ?code=. Neither goes to PostHog: the
// rep part becomes :rep and the code is dropped.
export function scrubUrl(value: unknown): unknown {
  if (typeof value !== 'string' || !value) return value
  try {
    const url = new URL(value)
    url.searchParams.delete('code')
    url.hash = url.hash.replace(/^#\/passport\/[^/?#]+/, '#/passport/:rep')
    return url.toString()
  } catch {
    return value.replace(/#\/passport\/[^/?#]+/, '#/passport/:rep').replace(/([?&])code=[^&#]*&?/, '$1')
  }
}

// Runs on every event just before it's sent. PostHog adds addresses under
// several names ($current_url, $session_entry_url, $initial_current_url,
// $referrer, and more in newer versions), so rather than keep a list, every
// value that's an address or carries a passport route is cleaned.
const looksLikeAddress = (value: string) => /^https?:\/\//.test(value) || value.includes('#/passport/')
export function scrubEvent<T extends { properties?: Record<string, unknown>; $set?: Record<string, unknown>; $set_once?: Record<string, unknown> } | null>(event: T): T {
  if (!event) return event
  for (const bag of [event.properties, event.$set, event.$set_once]) {
    if (!bag) continue
    for (const [key, value] of Object.entries(bag)) {
      if (typeof value === 'string' && looksLikeAddress(value)) bag[key] = scrubUrl(value)
    }
  }
  return event
}

function start(): Promise<PostHog | null> {
  const settings = runtime.posthog
  if (!settings) return Promise.resolve(null)
  starting ??= import('posthog-js').then(({ default: ph }) => {
    ph.init(settings.key, {
      api_host: settings.host,
      // Only signed-in reps get a person profile; demo visitors stay anonymous.
      person_profiles: 'identified_only',
      persistence: 'localStorage',
      autocapture: false,
      capture_pageview: false,
      capture_pageleave: false,
      capture_heatmaps: false,
      capture_dead_clicks: false,
      capture_exceptions: false,
      capture_performance: false,
      rageclick: false,
      disable_session_recording: true,
      disable_surveys: true,
      // No feature flags are used. Turning them off also keeps remote config,
      // the toolbar and site apps from loading.
      advanced_disable_flags: true,
      disable_external_dependency_loading: true,
      before_send: (event) => scrubEvent(event),
    })
    // The demo never speaks for a real rep: if this browser was last used
    // signed in to the live passport, start the demo as someone new.
    if (runtime.mode === 'demo' && ph.get_property('$user_state') === 'identified') ph.reset()
    ph.register({ app_mode: runtime.mode })
    posthog = ph
    return ph
  })
  return starting
}

// PostHog's own storage in this browser: its ph_<key>_... entries.
function clearStoredIds() {
  for (const store of [window.localStorage, window.sessionStorage]) {
    try {
      for (const key of Object.keys(store)) if (key.startsWith('ph_')) store.removeItem(key)
    } catch {
      // Storage blocked: there's nothing stored to clear.
    }
  }
}

// Turns analytics on or off as consent changes.
//   - No: forget this visitor entirely (a new id and device id), opt out,
//     stop PostHog storing anything, and clear what it stored. reset() comes
//     first because it also clears PostHog's own record of the opt-out.
//   - Yes again, on the same page: let it store again and opt back in,
//     without sending an extra opt-in event.
function sync() {
  const consent = consentNow()
  if (consent === 'granted') {
    void start().then((ph) => {
      if (!ph || !ph.has_opted_out_capturing()) return
      ph.set_config({ disable_persistence: false })
      ph.opt_in_capturing({ captureEventName: false })
      ph.register({ app_mode: runtime.mode })
    })
  } else if (consent === 'denied' && posthog) {
    posthog.reset({ resetDeviceID: true })
    posthog.opt_out_capturing()
    posthog.set_config({ disable_persistence: true })
    clearStoredIds()
  }
}

if (typeof window !== 'undefined' && runtime.posthog) {
  sync()
  onConsentChange(sync)
}

const allowed = () => runtime.posthog !== null && consentNow() === 'granted'

// With consent, PostHog may still be downloading when the first event
// happens (the passport opening, say), so wait for it. Without consent the
// event is dropped.
// Before anything is sent, the signed-in rep is identified if PostHog
// doesn't already know them (a reset, or consent given after sign-in), so
// no event of theirs goes out anonymous.
function whenReady(send: (ph: PostHog) => void) {
  if (!allowed()) return
  void start().then((ph) => {
    if (!ph || !allowed() || ph.has_opted_out_capturing()) return
    if (identity && ph.get_distinct_id() !== identity.userId) ph.identify(identity.userId, identity.props)
    send(ph)
  })
}

// app_mode goes on each event as well as being registered, so it survives
// a reset.
export function track(event: PassportEvent, props: Props = {}) {
  whenReady((ph) => ph.capture(event, { ...props, app_mode: runtime.mode }))
}

// The signed-in rep, by Supabase user id. Remembered so it applies as soon as
// analytics starts, if consent comes after sign-in.
export function identify(userId: string, props: Props = {}) {
  identity = { userId, props }
  whenReady((ph) => {
    if (ph.get_distinct_id() === userId && Object.keys(props).length) ph.setPersonProperties(props)
  })
}

// passport_completed for a signed-in rep, once per rep per browser. The
// marker is only written once the event has really gone, so a rep who
// qualified before saying yes to analytics is counted on their next visit.
const COMPLETED_KEY = 'pcp-analytics-v1'
function completedHere(): string[] {
  try {
    const value = JSON.parse(window.localStorage.getItem(COMPLETED_KEY) ?? '{}') as { completed?: unknown }
    return Array.isArray(value.completed) ? value.completed.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}
export function trackCompletion(userId: string, props: Props) {
  whenReady((ph) => {
    const done = completedHere()
    if (done.includes(userId)) return
    ph.capture('passport_completed', props, { $set_once: { passport_completed_on: props.as_of ?? null } })
    try {
      window.localStorage.setItem(COMPLETED_KEY, JSON.stringify({ completed: [...done, userId] }))
    } catch {
      // Blocked: it may be sent again next visit. Dashboards count people, not events.
    }
  })
}

// Signing out: forget who they were, so the next person on this browser
// isn't counted as them.
export function forgetIdentity() {
  identity = null
  if (posthog && posthog.get_property('$user_state') === 'identified') {
    posthog.reset()
    posthog.register({ app_mode: runtime.mode })
  }
}

