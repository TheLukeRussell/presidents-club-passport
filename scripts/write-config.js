// Writes the built site's config.js from environment variables, for the
// GitHub Pages deploy. The repo's public/config.js stays blank; this fills
// in dist/config.js after the build, from the repository's Actions secrets:
//
//   SUPABASE_URL           https://<project-ref>.supabase.co
//   SUPABASE_ANON_KEY      the anon / publishable key (never the service role key)
//   POSTHOG_PROJECT_KEY    phc_...
//   POSTHOG_HOST           optional, defaults to https://us.i.posthog.com
//   ONETRUST_ANALYTICS_GROUP  optional, defaults to C0002
//
// Any left unset stay blank, and blank means the site runs the demo, so a
// deploy without secrets still works. It never prints a value: Actions logs
// on a public repo are public.
//
//   node scripts/write-config.js dist/config.js

import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const out = process.argv[2]
if (!out) {
  console.error('Usage: node scripts/write-config.js <path to config.js>')
  process.exit(1)
}

const env = (name) => (process.env[name] ?? '').trim()
const fail = (message) => {
  console.error(`write-config: ${message} config.js was not written.`)
  process.exit(1)
}

const config = {
  supabaseUrl: env('SUPABASE_URL'),
  supabaseAnonKey: env('SUPABASE_ANON_KEY'),
  posthogKey: env('POSTHOG_PROJECT_KEY'),
  posthogHost: env('POSTHOG_HOST') || (env('POSTHOG_PROJECT_KEY') ? 'https://us.i.posthog.com' : ''),
  onetrustAnalyticsGroup: env('ONETRUST_ANALYTICS_GROUP') || 'C0002',
}

// The checks that matter most: nothing secret ends up in a file every
// visitor downloads.
const key = config.supabaseAnonKey
if (key.startsWith('sb_secret_')) fail('SUPABASE_ANON_KEY is a secret key. Use the publishable (anon) key.')
const payload = key.split('.')[1]
if (payload) {
  let role = null
  try {
    role = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')).role
  } catch {
    // Not a JWT; nothing to check.
  }
  if (role === 'service_role') fail('SUPABASE_ANON_KEY is the service role key. Use the anon key.')
}
if (config.posthogKey && !config.posthogKey.startsWith('phc_')) {
  fail('POSTHOG_PROJECT_KEY should be the project key (phc_...), never a personal API key (phx_...).')
}
if (config.supabaseUrl && !/^https:\/\/[^/\s]+$/.test(config.supabaseUrl.replace(/\/$/, ''))) fail('SUPABASE_URL should look like https://<project-ref>.supabase.co.')
if (config.posthogHost && !/^https:\/\/[^/\s]+$/.test(config.posthogHost.replace(/\/$/, ''))) fail('POSTHOG_HOST should look like https://us.i.posthog.com.')
if (Boolean(config.supabaseUrl) !== Boolean(config.supabaseAnonKey)) fail('Set both SUPABASE_URL and SUPABASE_ANON_KEY, or neither.')

const body = `// Written by scripts/write-config.js at deploy time. See public/config.js.
window.PASSPORT_CONFIG = ${JSON.stringify(config, null, 2)}
`
writeFileSync(resolve(out), body)

const on = (value) => (value ? 'set' : 'blank')
console.log(`write-config: wrote ${out}. Supabase ${on(config.supabaseUrl)}, PostHog ${on(config.posthogKey)}.${config.supabaseUrl ? '' : ' The site will run the demo.'}`)
