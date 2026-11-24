// The live passport, signed in against Supabase. These never touch a real
// Supabase project: config.js is swapped for one pointing at a made-up
// project, and every call to it is answered here. The demo's own tests
// (smoke.spec.ts) run with the real, blank config.js.

import { expect, test } from '@playwright/test'
import { EMAIL, fakeSupabase, PAT, SERVICE, signInWithCode } from './fakes.ts'

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
  // It never asks Supabase to make an account: the importer does that.
  expect(otp.body).toMatchObject({ email: EMAIL, create_user: false })
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

test('a wrong code says so, keeps focus in the box, and lets them try again', async ({ page }) => {
  await fakeSupabase(page, PAT)
  await page.goto('./')
  await page.getByLabel('Work email').fill(EMAIL)
  await page.getByLabel('Work email').press('Enter')
  const code = page.getByLabel('6-digit code')
  await expect(code).toBeFocused()
  await code.fill('000000')
  await code.press('Enter')
  await expect(page.getByRole('alert')).toContainText('That code didn’t work')
  // Still in the box, which points at the message, so retyping just works.
  await expect(code).toBeFocused()
  await expect(code).toHaveAttribute('aria-invalid', 'true')
  await expect(code).toHaveAttribute('aria-describedby', 'signin-problem')
  // Sending another says it went.
  await page.getByRole('button', { name: 'send another' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'We sent a new email' })).toBeVisible()
  await code.fill('123456')
  await code.press('Enter')
  await expect(page).toHaveURL(/#\/passport\/pat-rivera$/)
  await expect(page.locator('#main')).toBeFocused()
})

test('signing out works even when the network drops', async ({ page }) => {
  await fakeSupabase(page, PAT)
  await page.goto('./')
  await signInWithCode(page)
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
  await page.route('**/auth/v1/logout**', (route) => route.abort('internetdisconnected'))
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page.getByRole('heading', { name: 'Sign in to your passport' })).toBeVisible()
  // And it sticks: a reload doesn't bring the passport back.
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Sign in to your passport' })).toBeVisible()
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
