-- The three tables the passport reads: who the reps are, what they can earn a
-- stamp for, and which stamps each rep has. Supabase is the source of truth
-- for all three. The static public/data/passport.json stays as the demo's
-- fallback.
--
-- Names are kept plain and lowercase (reps, activities, stamps, rep_id,
-- earned_at) because PostHog will read these tables directly as a Postgres
-- source, and they show up there as-is.
--
-- This migration only creates things. Nothing here drops, truncates or
-- deletes.

-- Reps -----------------------------------------------------------------------

create table public.reps (
  id uuid primary key default gen_random_uuid(),
  -- Always stored lowercased and trimmed, so one person can't end up with two
  -- rows over "Jo.Smith@" and "jo.smith@". The check makes that a rule rather
  -- than a habit, and lets the importer upsert on the plain column.
  email text not null,
  name text not null,
  -- The business unit the rep sells for (Communications, POSB, NetSec, Cisco,
  -- Federal). The passport and its filters are built around it.
  team text,
  -- Optional. The brief asked for it, but nothing fills it yet.
  company text,
  -- The Supabase sign-in this rep is, once they've signed in. Filled in by
  -- the database (see the link_sign_ins_to_reps migration), never by the
  -- browser. PostHog identifies people by this same id.
  user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint reps_email_key unique (email),
  constraint reps_user_id_key unique (user_id),
  constraint reps_email_is_clean check (email = lower(btrim(email)) and email like '%_@_%'),
  constraint reps_name_not_blank check (btrim(name) <> '')
);

comment on table public.reps is 'One row per sales rep in the President''s Club program.';
comment on column public.reps.email is 'Lowercased, trimmed. Matches the email they sign in with.';
comment on column public.reps.team is 'Business unit: Communications, POSB, NetSec, Cisco or Federal.';
comment on column public.reps.company is 'Optional. Not used by the passport yet.';
comment on column public.reps.user_id is 'auth.users id, set by the database on first sign-in. PostHog distinct_id.';

-- Activities -----------------------------------------------------------------

-- The six kinds of stamp. Only five have a minimum: virtual trainings earn a
-- stamp but don't count toward the four in-person ones.
create table public.activities (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  title text not null,
  -- The supplier who ran it, for trainings and Hub courses. Null for fairs,
  -- Club Express and the quota.
  supplier text,
  -- City, for things that happen in a room. Shown on the stamp.
  location text,
  -- The day it happened. Null for Hub courses, which are self-paced (each
  -- rep's own completion day is on their stamp), and for the quota.
  event_date date,
  created_at timestamptz not null default now(),
  constraint activities_type_check check (
    type in ('in_person_training', 'virtual_training', 'supplier_fair', 'hub_training', 'club_express', 'quota')
  ),
  constraint activities_title_not_blank check (btrim(title) <> ''),
  -- A Hub course is one row however many days people finish it on, and the
  -- quota has no event day. Everything else is a dated event.
  constraint activities_date_matches_type check ((type in ('hub_training', 'quota')) = (event_date is null)),
  -- Club Express is two set sessions, so those are the only two it can be.
  -- The same pairs as CLUB_EXPRESS in src/config.ts: change both together.
  -- Without this, a session added by hand on the wrong day would count
  -- early in the passport, which matches sessions by name or day.
  constraint activities_club_express_sessions check (
    type <> 'club_express'
    or (title, event_date) in (('Club Express Fall', date '2026-10-14'), ('Club Express Spring', date '2027-06-17'))
  ),
  -- One row per event, so the importer can safely run twice. NULLS NOT
  -- DISTINCT makes two undated rows with the same type and title (the same
  -- Hub course) clash too, which plain UNIQUE would let through.
  constraint activities_identity_key unique nulls not distinct (type, title, event_date)
);

comment on table public.activities is 'Everything a rep can earn a stamp for: trainings, fairs, Hub courses, Club Express sessions and the quota.';
comment on column public.activities.type is 'in_person_training, virtual_training, supplier_fair, hub_training, club_express or quota.';
comment on column public.activities.event_date is 'Day of the event. Null for self-paced Hub courses and the quota.';

-- Stamps ---------------------------------------------------------------------

create table public.stamps (
  id uuid primary key default gen_random_uuid(),
  rep_id uuid not null references public.reps (id),
  activity_id uuid not null references public.activities (id),
  -- The day they attended or finished it. A date, not a timestamp: the sheet
  -- records days, and a timestamp can slip a day between time zones.
  earned_at date not null,
  -- How the stamp got here. scan is kept for a future check-in flow; nothing
  -- writes it yet. import is the attendance CSV; admin is set by hand (the
  -- quota is always admin).
  source text not null,
  created_at timestamptz not null default now(),
  constraint stamps_source_check check (source in ('scan', 'import', 'admin')),
  -- One stamp per rep per activity. The same Hub course finished twice still
  -- counts once.
  constraint stamps_rep_activity_key unique (rep_id, activity_id)
);

-- The unique key already covers lookups by rep. This one covers "who has a
-- stamp for this event".
create index stamps_activity_id_idx on public.stamps (activity_id);

comment on table public.stamps is 'One row per stamp a rep has earned. Unique on rep_id + activity_id.';
comment on column public.stamps.earned_at is 'Day attended or completed.';
comment on column public.stamps.source is 'scan, import or admin. Quota stamps are always admin.';

-- Two rules every stamp follows, checked in the database so no import path
-- can get them wrong:
--   - The quota is set by an admin, so its stamp says so.
--   - Nobody earns a stamp before the event happened. A Club Express Spring
--     stamp dated in November would otherwise count months early.
create function public.stamps_follow_the_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  activity record;
begin
  select a.type, a.event_date into activity from public.activities a where a.id = new.activity_id;
  if activity.type = 'quota' and new.source <> 'admin' then
    raise exception 'A sales growth quota stamp is set by an admin, so its source has to be admin (got %).', new.source;
  end if;
  if activity.event_date is not null and new.earned_at < activity.event_date then
    raise exception 'A stamp can''t be earned before its event: % is before %.', new.earned_at, activity.event_date;
  end if;
  return new;
end;
$$;

create trigger stamps_follow_the_rules
before insert or update of source, activity_id, earned_at on public.stamps
for each row execute function public.stamps_follow_the_rules();

-- It only ever runs as a trigger, so nobody needs to call it directly.
revoke all on function public.stamps_follow_the_rules() from public, anon, authenticated, service_role;
