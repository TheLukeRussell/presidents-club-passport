// Reads public/config.js, the runtime settings the deploy fills in, and
// decides which mode the site runs in:
//   - demo: config.js is blank (the repo as committed), or the URL asks for
//     ?demo. The sample data, the fixed demo date and the demo panel, exactly
//     as before.
//   - live: config.js has a Supabase URL and anon key. Reps sign in and see
//     their own stamps from Supabase.
// PostHog is separate: it's on whenever config.js has a key, in either mode,
// and still waits for cookie consent (src/analytics).
//
// Kept out of src/config.ts on purpose: that file is imported by the Node
// scripts and the tests, which have no window.

export interface PassportConfig {
  supabaseUrl?: string
  supabaseAnonKey?: string
  posthogKey?: string
  posthogHost?: string
}

declare global {
  interface Window {
    PASSPORT_CONFIG?: PassportConfig
  }
}

export interface Runtime {
  mode: 'demo' | 'live'
  supabase: { url: string; anonKey: string } | null
  posthog: { key: string; host: string } | null
  // Why live mode is off when config.js looks filled in, for the console.
  problem: string | null
}

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '')

// The anon key is fine in a browser. The service role key is not: it skips
// row-level security. If one ends up in config.js by mistake, refuse to use
// it rather than ship it into every request.
function keyProblem(key: string): string | null {
  if (key.startsWith('sb_secret_')) return 'config.js has a Supabase secret key. Use the publishable (anon) key.'
  const payload = key.split('.')[1]
  if (!payload) return null
  try {
    const role = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))).role
    if (role === 'service_role') return 'config.js has the Supabase service role key. Use the anon key.'
  } catch {
    // Not a JWT. Supabase will say so if it's wrong.
  }
  return null
}

export function readRuntime(config: PassportConfig | undefined, search: string): Runtime {
  const url = text(config?.supabaseUrl)
  const anonKey = text(config?.supabaseAnonKey)
  const key = text(config?.posthogKey)
  const host = text(config?.posthogHost) || 'https://us.i.posthog.com'
  const problem = url && anonKey ? keyProblem(anonKey) : null
  const supabase = url && anonKey && !problem ? { url, anonKey } : null
  const demoAsked = new URLSearchParams(search).has('demo')
  return {
    mode: supabase && !demoAsked ? 'live' : 'demo',
    supabase,
    posthog: key ? { key, host } : null,
    problem,
  }
}

export const runtime: Runtime = readRuntime(typeof window === 'undefined' ? undefined : window.PASSPORT_CONFIG, typeof window === 'undefined' ? '' : window.location.search)

if (runtime.problem) console.error(`${runtime.problem} The passport is running the demo instead.`)
