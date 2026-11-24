// The live passport, signed in against Supabase. These never touch a real
// Supabase project: config.js is swapped for one pointing at a made-up
// project, and every call to it is answered here. The demo's own tests
// (smoke.spec.ts) run with the real, blank config.js.

import { expect, test, type Page, type Route } from '@playwright/test'

const SUPABASE = 'https://pcp-test.supabase.co'
// A made-up anon key. Its middle part says role "anon", which is all the app
// checks before using it.
const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
const ANON = `${b64({ alg: 'HS256' })}.${b64({ role: 'anon', iss: 'supabase' })}.test`
const SERVICE = `${b64({ alg: 'HS256' })}.${b64({ role: 'service_role', iss: 'supabase' })}.test`

const USER_ID = '7d3f8a52-1c2b-4c55-9a0e-5b8d1f0a9c11'
const EMAIL = 'pat.rivera@example.com'

interface Fake {
  rep: { email: string; name: string; team: string } | null
  stamps: { earned_at: string; activity: { type: string; title: string; supplier: string | null; location: string | null } }[]
  // Answer for the email-link (PKCE) exchange; null means the link is no good.
  linkWorks?: boolean
}

const config = (key: string) =>
  `window.PASSPORT_CONFIG = { supabaseUrl: '${SUPABASE}', supabaseAnonKey: '${key}', posthogKey: '', posthogHost: '' }`

function session() {
  const now = Math.floor(Date.now() / 1000)
  const user = { id: USER_ID, aud: 'authenticated', role: 'authenticated', email: EMAIL, app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() }
  const access = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: USER_ID, email: EMAIL, role: 'authenticated', aud: 'authenticated', exp: now + 3600, iat: now })}.test`
  return { access_token: access, token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, refresh_token: 'refresh-test', user }
}

// Serves config.js and plays Supabase. Returns every call it saw.
async function fakeSupabase(page: Page, fake: Fake, key = ANON) {
  const calls: { method: string; path: string; search: string; body: unknown }[] = []
  await page.route('**/config.js', (route) => route.fulfill({ contentType: 'application/javascript', body: config(key) }))
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

const PAT: Fake = {
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
async function signInWithCode(page: Page) {
  await page.getByLabel('Work email').fill('Pat.Rivera@Example.com')
  await page.getByRole('button', { name: 'Email me a sign-in link' }).click()
  await expect(page.getByText(`We sent an email to ${EMAIL}`)).toBeVisible()
  await page.getByLabel('6-digit code').fill('123456')
  await page.getByRole('button', { name: 'Sign in' }).click()
}

test('a signed-out visitor gets the sign-in screen and nothing else', async ({ page }) => {
  const sample: string[] = []
  page.on('request', (r) => r.url().includes('data/passport.json') && sample.push(r.url()))
  const calls = await fakeSupabase(page, PAT)
  await page.goto('./')
  await expect(page.getByRole('heading', { name: 'Sign in to your passport' })).toBeVisible()
  await expect(page).toHaveTitle(/^Sign in · /)
  // No demo, no standings, no sample data, and nothing read from the tables.
  await expect(page.getByRole('button', { name: 'Demo', exact: true })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Standings' })).toHaveCount(0)
  await page.goto('./#/standings')
  await expect(page.getByRole('heading', { name: 'Sign in to your passport' })).toBeVisible()
  expect(sample).toEqual([])
  expect(calls.filter((c) => c.path.startsWith('/rest/'))).toEqual([])
})

test('a rep signs in with the emailed code and sees only their own passport', async ({ page, baseURL }) => {
  const sample: string[] = []
  page.on('request', (r) => r.url().includes('data/passport.json') && sample.push(r.url()))
  const calls = await fakeSupabase(page, PAT)
  await page.goto('./')
  await signInWithCode(page)

  // The email went to the lowercased address, with this site as the way back.
  const otp = calls.find((c) => c.path === '/auth/v1/otp')!
  expect(otp.body).toMatchObject({ email: EMAIL, create_user: true })
  expect(new URLSearchParams(otp.search).get('redirect_to')).toBe(baseURL)
  expect(calls.find((c) => c.path === '/auth/v1/verify')!.body).toMatchObject({ email: EMAIL, token: '123456', type: 'email' })

  await expect(page).toHaveURL(/#\/passport\/pat-rivera$/)
  await expect(page.getByRole('region', { name: 'Cover of Pat Rivera’s passport' }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
  // Just the one passport: no picker, no standings tab, no demo.
  await expect(page.getByLabel('Passport of')).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Standings' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Demo', exact: true })).toHaveCount(0)

  // The data page counts their stamps but doesn't rank them.
  await page.goto('./#/passport/pat-rivera?page=2')
  const data = page.locator('.book__slot').getByRole('region', { name: 'Data page', exact: true })
  await expect(data).toContainText('Not ranked')
  await expect(data).toContainText('Pat Rivera'.split(' ')[1])

  // A stamp's slip leaves out how many reps share it.
  await page.goto('./#/passport/pat-rivera?page=3')
  await page.locator('.book__slot').getByRole('button', { name: /^Supplier A solutions workshop, August 4, 2026/ }).click()
  const slip = page.getByRole('dialog')
  await expect(slip).toContainText('In person, Greenville')
  await expect(slip.getByText('Reps', { exact: true })).toHaveCount(0)
  await slip.getByRole('button', { name: 'Close' }).click()

  // Someone else's passport address opens your own instead.
  await page.goto('./#/passport/hannah-kowalski?page=4')
  await expect(page).toHaveURL(/#\/passport\/pat-rivera\?page=4$/)

  // Standings wait for later, and point at the demo's.
  await page.goto('./#/standings')
  await expect(page.getByRole('heading', { name: 'Standings aren’t here yet' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Open the demo’s standings' })).toHaveAttribute('href', '/presidents-club-passport/?demo#/standings')

  // Only reads went to the database, and the sample file was never fetched.
  const writes = calls.filter((c) => c.path.startsWith('/rest/') && c.method !== 'GET')
  expect(writes).toEqual([])
  expect(sample).toEqual([])

  // Signing out goes back to the front door.
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page.getByRole('heading', { name: 'Sign in to your passport' })).toBeVisible()
  expect(calls.some((c) => c.path === '/auth/v1/logout')).toBe(true)
})

test('a wrong code says so and lets them try again', async ({ page }) => {
  await fakeSupabase(page, PAT)
  await page.goto('./')
  await page.getByLabel('Work email').fill(EMAIL)
  await page.getByRole('button', { name: 'Email me a sign-in link' }).click()
  await page.getByLabel('6-digit code').fill('000000')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('alert')).toContainText('That code didn’t work')
  await page.getByLabel('6-digit code').fill('123456')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/#\/passport\/pat-rivera$/)
})

test('signed in but not on the roster gets told, not someone else’s passport', async ({ page }) => {
  await fakeSupabase(page, { rep: null, stamps: [] })
  await page.goto('./')
  await signInWithCode(page)
  await expect(page.getByRole('heading', { name: 'No passport for this email yet' })).toBeVisible()
  await expect(page.getByText(`You’re signed in as ${EMAIL}`)).toBeVisible()
  await page.getByRole('button', { name: 'Sign out' }).first().click()
  await expect(page.getByRole('heading', { name: 'Sign in to your passport' })).toBeVisible()
})

test('an email link that can’t sign in here explains why and offers the code', async ({ page }) => {
  await fakeSupabase(page, { ...PAT, linkWorks: false })
  await page.goto('./?code=already-used')
  await expect(page.getByRole('alert')).toContainText('That sign-in link didn’t work here')
  // The used code is taken out of the address.
  await expect.poll(() => new URL(page.url()).searchParams.has('code')).toBe(false)
})

test('?demo opens the demo even when Supabase is set up', async ({ page }) => {
  const calls = await fakeSupabase(page, PAT)
  await page.goto('./?demo#/passport/hannah-kowalski')
  await expect(page.getByRole('button', { name: 'Demo', exact: true })).toBeVisible()
  await expect(page.getByLabel('Passport of')).toBeVisible()
  expect(calls).toEqual([])
})

test('a service role key in config.js is refused and the demo runs instead', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  const calls = await fakeSupabase(page, PAT, SERVICE)
  await page.goto('./')
  await expect(page.getByRole('button', { name: 'Demo', exact: true })).toBeVisible()
  expect(errors.some((e) => e.includes('service role key'))).toBe(true)
  expect(calls).toEqual([])
})
