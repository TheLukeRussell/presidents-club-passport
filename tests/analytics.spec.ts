// PostHog: nothing before consent, the five events after it, and nothing in
// them that says who someone is. PostHog itself is faked (tests/fakes.ts),
// so nothing here reaches a real project.

import { expect, test, type Page } from '@playwright/test'
import { ANON, EMAIL, fakePostHog, fakeSupabase, POSTHOG, signInWithCode, USER_ID, type Fake } from './fakes.ts'

// config.js for the demo with PostHog on: no Supabase, so it's the sample data.
const demoWithPostHog = (page: Page) =>
  page.route('**/config.js', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `window.PASSPORT_CONFIG = { supabaseUrl: '', supabaseAnonKey: '', posthogKey: 'phc_test', posthogHost: '${POSTHOG}' }`,
    }),
  )
// posthog-js drops events from browsers that look like bots, and a test
// browser does twice over: its user agent says headless, and
// navigator.webdriver is set. Both are masked here so the tests see what a
// person's browser would; the app itself keeps the filter. The first test
// runs this way too, so "nothing sent" there really is down to consent.
test.use({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36' })
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => false }))
})

const consentGiven = (page: Page) => page.addInitScript(() => window.localStorage.setItem('pcp-consent-v1', 'granted'))
const shown = (page: Page) => page.locator('.book__slot')

// Nothing about who: no sample rep's name, no email, no rep id in a URL.
const anonymous = (raw: string) => {
  expect(raw).not.toMatch(/hannah|kowalski|pat-rivera|pat\.rivera|@example\.com/i)
}

test('nothing goes to PostHog until someone says yes', async ({ page }) => {
  await demoWithPostHog(page)
  const posthog = await fakePostHog(page)
  await page.goto('./#/passport/hannah-kowalski?page=3')
  await expect(page.getByRole('heading', { name: 'Help improve the passport?' })).toBeVisible()
  await shown(page).getByRole('button', { name: /^Zebra solutions workshop, September 23, 2026/ }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click()
  await page.waitForTimeout(1500)
  expect(posthog.requests).toEqual([])

  await page.getByRole('button', { name: 'No thanks' }).click()
  await expect(page.getByRole('button', { name: 'Analytics settings (off)' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Help improve the passport?' })).toHaveCount(0)
  await page.waitForTimeout(1500)
  expect(posthog.requests).toEqual([])
  // Nor did posthog-js leave anything in the browser.
  const stored = await page.evaluate(() => Object.keys(window.localStorage).filter((k) => k.startsWith('ph_') || k.includes('posthog')))
  expect(stored).toEqual([])
})

test('with consent, the passport events go out and say nothing about who', async ({ page }) => {
  await demoWithPostHog(page)
  await consentGiven(page)
  const posthog = await fakePostHog(page)
  await page.goto('./#/passport/hannah-kowalski?page=3')
  await expect(page.getByRole('heading', { name: 'Help improve the passport?' })).toHaveCount(0)

  // passport_viewed, once, however many pages are turned.
  await expect.poll(() => posthog.named('passport_viewed').length, { timeout: 15_000 }).toBe(1)
  await page.getByRole('button', { name: 'Next page' }).click()
  await page.getByRole('button', { name: 'Previous page' }).click()

  // stamp_viewed.
  await shown(page).getByRole('button', { name: /^Zebra solutions workshop, September 23, 2026/ }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click()
  // activity_clicked, from the checklist.
  await page.goto('./#/passport/hannah-kowalski?page=7')
  await shown(page).getByRole('button', { name: /^Hub training:/ }).click()

  await expect.poll(() => posthog.named('stamp_viewed').length, { timeout: 15_000 }).toBe(1)
  await expect.poll(() => posthog.named('activity_clicked').length, { timeout: 15_000 }).toBe(1)
  expect(posthog.named('passport_viewed')).toHaveLength(1)

  const [viewed] = posthog.named('passport_viewed')
  expect(viewed.properties).toMatchObject({ own_passport: true, opened_on_page: 3, app_mode: 'demo' })
  expect(String(viewed.properties.$current_url)).toContain('#/passport/:rep')
  expect(posthog.named('stamp_viewed')[0].properties).toMatchObject({ activity_type: 'in_person_training', activity_title: 'Zebra solutions workshop', supplier: 'Zebra', page: 3 })
  expect(posthog.named('activity_clicked')[0].properties).toMatchObject({ activity_type: 'hub_training', minimum: 2, from: 'checklist' })

  // Only the passport's own events: no pageviews, no autocapture, no replay.
  const names = new Set(posthog.events.map((e) => e.event))
  for (const name of names) expect(['passport_viewed', 'stamp_viewed', 'activity_clicked']).toContain(name)
  for (const e of posthog.events) anonymous(e.raw)
  expect(posthog.requests.some((r) => /flags|decide|recorder|surveys|array\//.test(r))).toBe(false)

  // Turning it off stops everything after, and leaves no PostHog id behind.
  await page.getByRole('button', { name: 'Analytics settings (on)' }).click()
  await expect(page.getByRole('heading', { name: 'Help improve the passport?' })).toBeFocused()
  await page.getByRole('button', { name: 'No thanks' }).click()
  await expect(page.getByRole('button', { name: 'Analytics settings (off)' })).toBeFocused()
  const stored = await page.evaluate(() => [...Object.keys(localStorage), ...Object.keys(sessionStorage)].filter((k) => k.startsWith('ph_')))
  expect(stored).toEqual([])
  const before = posthog.events.length
  await page.goto('./#/passport/jordan-hale?page=3')
  await page.waitForTimeout(2500)
  expect(posthog.events.length).toBe(before)
})

test('the cookie question never covers the page controls', async ({ page }) => {
  await demoWithPostHog(page)
  await page.goto('./#/passport/hannah-kowalski?page=3')
  const banner = page.locator('.consent')
  await expect(banner).toBeVisible()
  const next = page.getByRole('button', { name: 'Next page' })
  await next.scrollIntoViewIfNeeded()
  const [b, n] = await Promise.all([banner.boundingBox(), next.boundingBox()])
  expect(n!.y + n!.height).toBeLessThanOrEqual(b!.y + 1)
  // A phone turns one page, a laptop a whole spread.
  await next.click()
  await expect(page).toHaveURL(/page=[45]$/)
})

// A rep with everything done by late June: four in-person trainings, two
// fairs, two Hub courses, both Club Express sessions and the quota.
const DONE: Fake = {
  rep: { email: EMAIL, name: 'Pat Rivera', team: 'POSB' },
  stamps: [
    ...['A', 'B', 'C', 'D'].map((x, i) => ({
      earned_at: `2026-0${8 + (i % 2)}-1${i}`,
      activity: { type: 'in_person_training', title: `Supplier ${x} solutions workshop`, supplier: `Supplier ${x}`, location: 'Greenville' },
    })),
    { earned_at: '2026-09-10', activity: { type: 'supplier_fair', title: 'Fall Supplier Fair', supplier: null, location: 'Atlanta' } },
    { earned_at: '2026-12-03', activity: { type: 'supplier_fair', title: 'Winter Supplier Fair', supplier: null, location: 'Dallas' } },
    { earned_at: '2026-10-01', activity: { type: 'hub_training', title: 'Video room design', supplier: 'Supplier C', location: null } },
    { earned_at: '2026-11-02', activity: { type: 'hub_training', title: 'Fabric networking 101', supplier: 'Supplier F', location: null } },
    { earned_at: '2026-10-14', activity: { type: 'club_express', title: 'Club Express Fall', supplier: null, location: 'Greenville' } },
    { earned_at: '2027-06-17', activity: { type: 'club_express', title: 'Club Express Spring', supplier: null, location: 'Greenville' } },
    { earned_at: '2027-06-28', activity: { type: 'quota', title: 'FY27 sales growth quota', supplier: null, location: null } },
  ],
}

test('a signed-in rep is known by their user id, signs in once, and completes once', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2027-06-29T16:00:00Z'))
  await consentGiven(page)
  await fakeSupabase(page, DONE, ANON, 'phc_test')
  const posthog = await fakePostHog(page)
  await page.goto('./')
  await signInWithCode(page)
  await expect(page).toHaveURL(/#\/passport\/pat-rivera$/)

  await expect.poll(() => posthog.named('signed_in').length, { timeout: 15_000 }).toBe(1)
  await expect.poll(() => posthog.named('passport_completed').length, { timeout: 15_000 }).toBe(1)
  await expect.poll(() => posthog.named('passport_viewed').length, { timeout: 15_000 }).toBe(1)

  // Identified by the Supabase user id, with their team and nothing personal.
  const identify = posthog.named('$identify')
  expect(identify.length).toBeGreaterThan(0)
  expect(identify.every((e) => e.properties.distinct_id === USER_ID)).toBe(true)
  expect(posthog.named('signed_in')[0].properties).toMatchObject({ distinct_id: USER_ID, method: 'code', app_mode: 'live' })
  expect(posthog.named('passport_completed')[0].properties).toMatchObject({ source: 'supabase', as_of: '2027-06-29', stamps_total: 11 })
  expect(posthog.named('passport_viewed')[0].properties).toMatchObject({ own_passport: true, qualified: true, minimums_met: 5 })
  for (const e of posthog.events) anonymous(e.raw)

  // A reload isn't a new sign-in, and the completion isn't sent twice.
  await page.reload()
  await expect.poll(() => posthog.named('passport_viewed').length, { timeout: 15_000 }).toBe(2)
  await page.waitForTimeout(1000)
  expect(posthog.named('signed_in')).toHaveLength(1)
  expect(posthog.named('passport_completed')).toHaveLength(1)
})
