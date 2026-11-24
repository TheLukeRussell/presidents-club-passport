// Runtime settings for the passport. This one file is all that tells the site
// to read from Supabase and send analytics to PostHog.
//
// It's committed blank on purpose. With it blank, the site runs the demo on
// the sample data exactly as before, so GitHub Pages never breaks. The deploy
// workflow fills it in from the repository's Actions secrets (see README,
// "Fill in config.js"), so the real values never sit in the repo.
//
// Only public values go here: the Supabase project URL, its anon (publishable)
// key, and the PostHog project key and host. All four end up in every
// visitor's browser anyway. NEVER put the Supabase service role key or a
// PostHog personal API key here.
window.PASSPORT_CONFIG = {
  supabaseUrl: '',
  supabaseAnonKey: '',
  posthogKey: '',
  posthogHost: '',
}
