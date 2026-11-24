// Shared fakes for the live passport's tests: a made-up Supabase project
// answered entirely in the browser, and a stand-in for PostHog that records
// what would have been sent. Nothing here reaches a real service.

import { gunzipSync } from 'node:zlib'
import { expect, type Page, type Route } from '@playwright/test'

export const SUPABASE = 'https://pcp-test.supabase.co'
export const POSTHOG = 'https://us.i.posthog.com'
// A made-up anon key. Its middle part says role "anon", which is all the app
// checks before using it.
export const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
export const ANON = `${b64({ alg: 'HS256' })}.${b64({ role: 'anon', iss: 'supabase' })}.test`
export const SERVICE = `${b64({ alg: 'HS256' })}.${b64({ role: 'service_role', iss: 'supabase' })}.test`

export const USER_ID = '7d3f8a52-1c2b-4c55-9a0e-5b8d1f0a9c11'
export const EMAIL = 'pat.rivera@example.com'

export interface Fake {
  rep: { email: string; name: string; team: string } | null
  stamps: { earned_at: string; activity: { type: string; title: string; supplier: string | null; location: string | null } }[]
  // Answer for the email-link (PKCE) exchange; null means the link is no good.
  linkWorks?: boolean
}

export const config = (key: string, posthogKey = '') =>
  `window.PASSPORT_CONFIG = { supabaseUrl: '${SUPABASE}', supabaseAnonKey: '${key}', posthogKey: '${posthogKey}', posthogHost: '${posthogKey ? POSTHOG : ''}' }`

// Good until 2100, so a test can move the page's clock forward (to see a
// rep qualify in June) without the made-up session expiring.
function session() {
  const now = Math.floor(Date.UTC(2100, 0, 1) / 1000) - 3600
  const user = { id: USER_ID, aud: 'authenticated', role: 'authenticated', email: EMAIL, app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() }
  const access = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: USER_ID, email: EMAIL, role: 'authenticated', aud: 'authenticated', exp: now + 3600, iat: now })}.test`
  return { access_token: access, token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, refresh_token: 'refresh-test', user }
}

// Serves config.js and plays Supabase. Returns every call it saw.
export async function fakeSupabase(page: Page, fake: Fake, key = ANON, posthogKey = '') {
  const calls: { method: string; path: string; search: string; body: unknown }[] = []
  await page.route('**/config.js', (route) => route.fulfill({ contentType: 'application/javascript', body: config(key, posthogKey) }))
  await page.route(`${SUPABASE}/**`, async (route: Route) => {
    const request = route.request()
    const url = new URL(request.url())
    let body: unknown = null
    try {
      body = request.postDataJSON()
    } catch {
      body = request.postData()
    }
    calls.push({ method: request.method(), path: url.pathname, search: url.search, body })
    const json = (status: number, value: unknown) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value) })
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204 })
    switch (url.pathname) {
      case '/auth/v1/otp':
        return json(200, {})
      case '/auth/v1/verify':
        return (body as { token?: string }).token === '123456' ? json(200, session()) : json(403, { code: 'otp_expired', msg: 'Token has expired or is invalid' })
      case '/auth/v1/token':
        if (url.searchParams.get('grant_type') === 'pkce' && fake.linkWorks) return json(200, session())
        if (url.searchParams.get('grant_type') === 'refresh_token') return json(200, session())
        return json(400, { error: 'invalid_grant', error_description: 'invalid flow state, no valid flow state found' })
      case '/auth/v1/user':
        return json(200, session().user)
      case '/auth/v1/logout':
        return route.fulfill({ status: 204 })
      case '/rest/v1/reps': {
        const one = (request.headers()['accept'] ?? '').includes('vnd.pgrst.object')
        if (one) return fake.rep ? json(200, fake.rep) : json(406, { code: 'PGRST116', message: 'no rows' })
        return json(200, fake.rep ? [fake.rep] : [])
      }
      case '/rest/v1/stamps':
        return json(200, fake.stamps)
      default:
        return json(404, { message: `not faked: ${url.pathname}` })
    }
  })
  return calls
}

export const PAT: Fake = {
  rep: { email: EMAIL, name: 'Pat Rivera', team: 'POSB' },
  stamps: [
    { earned_at: '2026-08-04', activity: { type: 'in_person_training', title: 'Supplier A solutions workshop', supplier: 'Supplier A', location: 'Greenville' } },
    { earned_at: '2026-08-12', activity: { type: 'virtual_training', title: 'Supplier B partner training', supplier: 'Supplier B', location: null } },
    { earned_at: '2026-09-10', activity: { type: 'supplier_fair', title: 'Fall Supplier Fair', supplier: null, location: 'Atlanta' } },
    { earned_at: '2026-10-01', activity: { type: 'hub_training', title: 'Video room design', supplier: 'Supplier C', location: null } },
    { earned_at: '2026-10-14', activity: { type: 'club_express', title: 'Club Express Fall', supplier: null, location: 'Greenville' } },
  ],
}

// Signs in the way a rep would with the code from the email.
export async function signInWithCode(page: Page) {
  await page.getByLabel('Work email').fill('Pat.Rivera@Example.com')
  await page.getByRole('button', { name: 'Email me a sign-in link' }).click()
  await expect(page.getByText(`We sent an email to ${EMAIL}`)).toBeVisible()
  await page.getByLabel('6-digit code').fill('123456')
  await page.getByRole('button', { name: 'Sign in' }).click()
}


// A stand-in for PostHog: answers every request to it and keeps the events
// that would have been sent, decoded, whatever compression posthog-js used.
// posthog-js puts distinct_id inside properties.
export interface Sent {
  event: string
  properties: Record<string, unknown> & { distinct_id?: string }
  raw: string
}

function decode(body: Buffer | null, url: URL): string {
  if (!body?.length) return ''
  if (url.searchParams.get('compression') === 'gzip-js' || (body[0] === 0x1f && body[1] === 0x8b)) return gunzipSync(body).toString('utf8')
  const text = body.toString('utf8')
  if (text.startsWith('data=')) return Buffer.from(decodeURIComponent(text.slice(5)), 'base64').toString('utf8')
  return text
}

export async function fakePostHog(page: Page) {
  const requests: string[] = []
  const events: Sent[] = []
  await page.route(/https:\/\/[a-z0-9.-]*posthog\.com\//, async (route: Route) => {
    const request = route.request()
    const url = new URL(request.url())
    requests.push(`${request.method()} ${url.pathname}`)
    const raw = decode(request.postDataBuffer(), url)
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as unknown
        const list = (Array.isArray(parsed) ? parsed : ((parsed as { batch?: unknown[] }).batch ?? [parsed])) as Sent[]
        for (const e of list) if (e && typeof e === 'object' && 'event' in e) events.push({ ...e, raw: JSON.stringify(e) })
      } catch {
        // Not an event payload.
      }
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 1 }) })
  })
  const named = (name: string) => events.filter((e) => e.event === name)
  return { requests, events, named }
}
