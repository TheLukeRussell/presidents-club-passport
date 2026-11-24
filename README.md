# President's Club Passport (demo)

Qualifying for President's Club in FY27 takes five things: four in-person supplier trainings, two supplier fairs, two Hub courses, both Club Express events and your sales growth quota. Reps need to know where they stand, and leadership needs one place to see everybody. This is a clickable mockup of how I want that to work: a passport for every rep with a stamp for everything they've done, and a standings board for the whole team.

Out of the box it runs on sample data. There's no login and no backend, and every name and number is made up. It's branded ScanSource (the logo up top and in gold on the back cover, brand colors and type on the pages and the standings). The covers are navy leather with gold foil instead of brand colors, because that's what a passport looks like.

Live demo: https://thelukerussell.github.io/presidents-club-passport/

## Supabase and PostHog (proof of concept)

The same site can also run as the real thing: reps sign in with their email, and each one sees their own passport, read from Supabase. PostHog counts how it gets used, once someone says yes to cookies. Which one you get depends on `public/config.js`:

| `config.js` | What runs |
|---|---|
| Blank (as committed) | The demo, exactly as before: sample data, the demo panel, standings. |
| Supabase filled in | The live passport: sign in, your own stamps, today's real date (Eastern time). |
| Supabase filled in, and `?demo` in the address | The demo again, for showing people how it works. |

PostHog is separate. It's on whenever `config.js` has its key, in either mode, and still sends nothing until the visitor agrees.

In the live passport a rep can only ever read their own stamps, so it leaves out what needs everyone's data: the standings board, the rank on the data page and "N reps were there". Those stay in the demo for now.

`config.js` stays blank in the repo. The GitHub Pages deploy fills it in from the repository's secrets, so the keys never sit in git. Both keys still reach every visitor's browser, which is how they're meant to be used: Supabase's anon key is protected by row-level security, and PostHog's project key can only send events.

**Never put the Supabase service role key or a PostHog personal API key (`phx_`) in `config.js`, in front-end code, in a GitHub secret the deploy uses, or in a commit.** The app, the deploy script and the tests all refuse a service role key if one turns up where it shouldn't.

## Setup

Do these in order. Nothing here runs against Supabase or PostHog until you do it.

### 1. Create the Supabase project

Make a new, empty project at [supabase.com](https://supabase.com/dashboard). Note its project ref (the `abcdefgh` in `https://abcdefgh.supabase.co`) and keep the database password somewhere safe.

### 2. Run the migrations

The five files in `supabase/migrations` create everything, in order. They only create and grant: nothing in them drops, truncates or deletes.

| File | Creates |
|---|---|
| `…190000_create_passport_tables.sql` | `reps`, `activities`, `stamps`, and a check that quota stamps are set by an admin |
| `…190100_lock_down_passport_access.sql` | Row-level security. Signed out: nothing. Signed in: your own rep row and stamps, plus the activity list. No writes from the browser. The service role can read, add and update, but not delete. |
| `…190200_create_rep_progress_view.sql` | `rep_progress`: each rep's count per type vs the minimum, minimums met, `completion_percent`, `qualified` |
| `…190300_link_sign_ins_to_reps.sql` | Links a Supabase sign-in to its rep row by email, plus an optional roster-only sign-up hook |
| `…190400_create_posthog_reader.sql` | The `posthog_reader` login and the `posthog` schema it reads (no password set) |

Easiest: open the project's **SQL Editor**, paste each file in order and run it.

Or with the Supabase CLI, from the repo root:

```sh
npx supabase init          # once, if there's no supabase/config.toml
npx supabase link --project-ref <your-project-ref>
npx supabase db push       # applies supabase/migrations
```

### 3. Run the seed (test data, optional)

`supabase/seed.sql` holds the demo's 60 made-up reps (all `@example.com`) and 605 stamps, with every supplier swapped for "Supplier A", "Supplier B" and so on. It only inserts, and skips what's already there.

To regenerate it from the sample data: `npm run seed`. That only writes the file. To load it, paste it into the SQL Editor and run it, once the migrations are in. Skip this on a project that will hold real reps.

The sample stamps run from July 2026 to June 2027, and the live passport only counts stamps dated today or earlier, so more of them count as the year goes on.

### 4. Set up sign-in

In the Supabase dashboard, under **Authentication**:

1. **URL Configuration.** Set the Site URL to `https://thelukerussell.github.io/presidents-club-passport/`. Add these Redirect URLs:
   - `https://thelukerussell.github.io/presidents-club-passport/`
   - `https://thelukerussell.github.io/presidents-club-passport/**`
   - `http://localhost:5173/presidents-club-passport/**` (the dev server)
   - `http://localhost:5175/presidents-club-passport/**` (the browser tests)
2. **Emails (templates).** In both **Magic Link** and **Confirm signup**, add the 6-digit code next to the link, for example `Or type this code: {{ .Token }}`. A new rep gets Confirm signup the first time and Magic Link after that. The code matters because a link only works in the browser that asked for it, and some work email scanners click links before the rep does, which uses them up.
3. **Hooks.** Add a **Before User Created** hook, type Postgres, function `public.hook_only_roster_sign_ups`. Only emails already in `reps` can then get an account. Without it, anyone can ask for a sign-in email (they still see nothing). Keep **Allow new users to sign up** on: the hook is what decides, and turning sign-ups off would lock out reps who've never signed in.
4. **SMTP.** Supabase's built-in email only sends to your own Supabase team's addresses, and only 2 an hour. That's fine for testing with your own address. Before real reps sign in, set up your own email provider under **Authentication, SMTP**, and turn off its link tracking, which breaks sign-in links.

To try sign-in yourself, add yourself as a rep with the importer (step 6) using a CSV with your own email. Keep that CSV out of the repo: `*.csv` is gitignored.

### 5. Fill in config.js

Leave `public/config.js` blank in git. The deploy fills it in from Actions secrets. In GitHub, go to the repo's **Settings, Secrets and variables, Actions, New repository secret**, and add:

| Secret | Value |
|---|---|
| `SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `SUPABASE_ANON_KEY` | Project Settings, API Keys: the **anon** / publishable key |
| `POSTHOG_PROJECT_KEY` | The PostHog project key (`phc_…`) |
| `POSTHOG_HOST` | `https://us.i.posthog.com` (US Cloud) |
| `ONETRUST_ANALYTICS_GROUP` | Optional. Defaults to `C0002`. |

The next deploy picks them up. Pages only deploys from `main`, on a push or with **Actions, Deploy to Pages, Run workflow**. With no secrets set, the deploy writes a blank `config.js` and the site runs the demo.

For local testing, fill in `public/config.js` on your machine and run `npm run dev`. Don't commit it: `npm test` fails if `config.js` isn't blank, and CI runs `npm test` before every deploy.

### 6. Import attendance (dry run first)

```sh
cp .env.example .env       # then fill in SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
npm run import:attendance -- path/to/attendance.csv           # dry run: shows what it would do
npm run import:attendance -- path/to/attendance.csv --apply   # does it
```

`.env` is gitignored and is the only place the service role key goes.

The dry run reads the database and lists exactly which reps, activities and stamps are new, and which rep names or teams would change. It writes nothing. `--apply` makes those changes and nothing else. It never deletes, never blanks a field, and running the same file twice adds nothing the second time.

| Column | Needed | Notes |
|---|---|---|
| `email` | Yes | Lowercased on the way in |
| `name` | Yes | |
| `date` | Yes | `2026-09-24` or `9/24/2026`. Rows dated after today, or outside FY27, are left out. |
| `type` | Usually | `in_person_training`, `virtual_training`, `supplier_fair`, `hub_training`, `club_express` or `quota`. If it's missing, the importer works it out from the title where it can ("Fall Supplier Fair" is a fair). |
| `title` (or `Activity title`) | Yes, except quota | The event or course |
| `team`, `company`, `supplier`, `format`, `location` | No | A training with no format counts as virtual. |

Club Express rows have to be one of the two sessions in `src/config.ts`. A Hub course is one activity however many days people finish it on. Quota rows are stored as set by an admin.

### 7. Link Supabase in PostHog

PostHog reads the passport data through `posthog_reader`: a read-only login that sees four views in the `posthog` schema (`reps`, `activities`, `stamps`, `rep_progress`), with every rep's data and no emails.

1. Give it a password. In the Supabase SQL Editor, run this with a long random password of your own. Don't save it in the repo.
   ```sql
   alter role posthog_reader with password 'a-long-random-password';
   ```
2. Copy the connection details from Supabase's **Connect** dialog, under **Session pooler** (IPv4, port 5432).
3. In the PostHog project, go to **Data pipelines, Sources, New source, Postgres** and enter:
   - Host: the session pooler host
   - Port: `5432`
   - Database: `postgres`
   - User: `posthog_reader.<project-ref>`. The pooler wants the project ref after a dot.
   - Password: the one from step 1
   - Schema: `posthog`
4. Pick the four views to sync. They're small, so a full refresh is fine.
5. If the Supabase project has network restrictions turned on, allow PostHog's US Cloud addresses: `44.205.89.55`, `52.4.194.122`, `44.208.188.173` and `3.41.215.48/28`.

PostHog people are identified by their Supabase user id, which is `user_id` in these tables, so dashboards can join events to reps and progress.

### Recommended PostHog project settings

- **Drop other sites' events.** The project key is public by design, and PostHog accepts events from anywhere that has it. Authorized URLs don't stop that. A **Drop events** transformation (Data pipelines, Transformations) that drops anything whose `$host` isn't `thelukerussell.github.io` keeps the data clean.
- **Discard client IP data**, in project settings, if you don't want visitors' IP addresses stored.
- **Billing limit.** Limits are set per product for the whole organization, so an org admin should set one.

The code already turns off autocapture, pageviews, session replay, surveys, heatmaps, feature flags and outside scripts, whatever the project's own settings say.

### OneTrust (optional)

By default the passport asks about analytics with its own small banner. To use OneTrust instead, paste its script into `index.html` where the comment marks the OneTrust hook. The passport then hides its banner and turns analytics on only while OneTrust's analytics group is allowed (`C0002` by default, or `ONETRUST_ANALYTICS_GROUP`). OneTrust licenses scripts per domain, so the `github.io` address needs to be in the OneTrust setup.

## What PostHog gets

Five events, and nothing until the visitor says yes. Nothing that names a rep is sent: rep IDs in addresses (`#/passport/jo-smith`) become `#/passport/:rep`, and sign-in codes are taken out.

| Event | When | Properties |
|---|---|---|
| `passport_viewed` | A passport opens (not on every page turn) | `own_passport`, `minimums_met`, `stamps_total`, `qualified`, `status`, `opened_on_page` |
| `signed_in` | A rep signs in (not on a reload) | `method`: `link` or `code` |
| `stamp_viewed` | A stamp's detail slip opens | `activity_type`, `activity_title`, `supplier`, `earned_at`, `page` |
| `activity_clicked` | A checklist row is tapped | `activity_type`, `counted`, `minimum`, `met`, `from` |
| `passport_completed` | A rep has all five minimums, once per rep per browser | `as_of`, `stamps_total`, `source` |

Every event also has `app_mode` (`demo` or `live`). `activity_type` uses the same names as the `activities.type` column.

## Running it

```sh
npm install
npm run dev          # the demo, unless public/config.js is filled in
npm test             # unit tests (also run before every deploy)
npm run test:e2e     # browser tests: the demo, the live passport and analytics, against faked Supabase and PostHog
npm run build        # what Pages deploys
```

Other scripts: `npm run data` rebuilds the sample `passport.json`, `npm run import` checks a real tracking-sheet export locally (it stays on your machine), `npm run seed` rebuilds `supabase/seed.sql`.

The demo's sample data in `public/data/passport.json` is unchanged and stays the fallback.
