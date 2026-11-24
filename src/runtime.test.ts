// Which mode the site runs in, from public/config.js. Also guards the file
// itself: it has to be committed blank, because the deploy fills it in and
// this repo is public.

import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import { readRuntime, type PassportConfig } from './runtime'

const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
const jwt = (role: string) => `${b64({ alg: 'HS256' })}.${b64({ role })}.sig`
const filled: PassportConfig = { supabaseUrl: 'https://abc.supabase.co', supabaseAnonKey: jwt('anon'), posthogKey: 'phc_test', posthogHost: '' }

describe('readRuntime', () => {
  it('runs the demo when config.js is blank or missing', () => {
    expect(readRuntime(undefined, '').mode).toBe('demo')
    expect(readRuntime({ supabaseUrl: '', supabaseAnonKey: '' }, '').mode).toBe('demo')
    expect(readRuntime({ supabaseUrl: 'https://abc.supabase.co' }, '').mode).toBe('demo')
  })

  it('runs live once Supabase is filled in', () => {
    const r = readRuntime(filled, '')
    expect(r.mode).toBe('live')
    expect(r.supabase).toEqual({ url: 'https://abc.supabase.co', anonKey: filled.supabaseAnonKey })
  })

  it('lets ?demo open the demo on a live site', () => {
    expect(readRuntime(filled, '?demo').mode).toBe('demo')
    expect(readRuntime(filled, '?code=x').mode).toBe('live')
  })

  it('refuses a service role or secret key, and says why', () => {
    for (const key of [jwt('service_role'), 'sb_secret_abc123']) {
      const r = readRuntime({ ...filled, supabaseAnonKey: key }, '')
      expect(r.mode).toBe('demo')
      expect(r.supabase).toBeNull()
      expect(r.problem).toMatch(/service role|secret/)
    }
  })

  it('accepts the new publishable keys', () => {
    expect(readRuntime({ ...filled, supabaseAnonKey: 'sb_publishable_abc123' }, '').mode).toBe('live')
  })

  it('turns PostHog on only with a key, on US Cloud unless told otherwise', () => {
    expect(readRuntime({}, '').posthog).toBeNull()
    expect(readRuntime(filled, '').posthog).toEqual({ key: 'phc_test', host: 'https://us.i.posthog.com' })
    expect(readRuntime({ ...filled, posthogHost: 'https://eu.i.posthog.com' }, '').posthog?.host).toBe('https://eu.i.posthog.com')
    expect(readRuntime({}, '').onetrustGroup).toBe('C0002')
  })
})

describe('public/config.js', () => {
  it('is committed blank, so the demo is what the repo ships', () => {
    const window: { PASSPORT_CONFIG?: PassportConfig } = {}
    runInNewContext(readFileSync('public/config.js', 'utf8'), { window })
    const c = window.PASSPORT_CONFIG!
    expect([c.supabaseUrl, c.supabaseAnonKey, c.posthogKey, c.posthogHost]).toEqual(['', '', '', ''])
    expect(readRuntime(c, '').mode).toBe('demo')
  })
})
