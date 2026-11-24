-- posthog_reader: the Postgres login PostHog uses to read the passport data
-- as a data warehouse source, for dashboards.
--
-- In PostHog, add a Postgres source with schema "posthog" and user
-- posthog_reader. That schema holds four views with the passport's own
-- names, reps, activities, stamps and rep_progress, and the same columns as
-- the real tables, except that reps has no email.
--
-- What posthog_reader can do: SELECT, on those views and on the same columns
-- of the real tables underneath them. Never reps.email, never a write, and
-- nothing outside the passport tables. Every session it opens is read-only
-- as well.
--
-- Why a schema of views: PostHog's Postgres sync reads each table with
-- SELECT *. On the real reps table that would fail, because email is held
-- back. The posthog.reps view never had the column, so SELECT * works and
-- can't leak it.
--
-- No password is set here, because this repo is public: nobody can log in as
-- it until you set one by hand. See "Link Supabase in PostHog" in the README.
--
-- This migration only creates things and grants. Nothing here drops,
-- truncates or deletes.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'posthog_reader') then
    create role posthog_reader
      login
      nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls
      connection limit 5;
  end if;
end;
$$;

comment on role posthog_reader is 'Read-only login for PostHog''s Postgres source: SELECT on the views in schema posthog (no rep emails).';

-- A second lock behind the grants: anything it runs is read-only, and a
-- runaway query is stopped after a minute.
alter role posthog_reader set default_transaction_read_only = on;
alter role posthog_reader set statement_timeout = '60s';

-- The real tables ----------------------------------------------------------------
-- Every column except reps.email. Row-level security stays on, and a role
-- that doesn't bypass it sees no rows unless a policy names it, so each table
-- gets one that lets posthog_reader read every row.

grant usage on schema public to posthog_reader;
grant select (id, name, team, company, user_id, created_at) on table public.reps to posthog_reader;
grant select on table public.activities, public.stamps, public.rep_progress to posthog_reader;

create policy "PostHog can read all reps"
on public.reps
for select
to posthog_reader
using (true);

create policy "PostHog can read all activities"
on public.activities
for select
to posthog_reader
using (true);

create policy "PostHog can read all stamps"
on public.stamps
for select
to posthog_reader
using (true);

-- The posthog schema ----------------------------------------------------------------
-- security_invoker, like rep_progress: each view runs with the rights of
-- whoever reads it, so the grants and policies above are the whole story.
-- Anyone else who somehow reached these views would still only see what
-- they can see already. Each view names its columns rather than using *, so
-- a column added to a table later doesn't reach PostHog until someone adds
-- it here on purpose.

create schema if not exists posthog;
comment on schema posthog is 'Views of the passport tables for PostHog''s Postgres source. Not exposed to the Data API.';
revoke all on schema posthog from public, anon, authenticated, service_role;

create view posthog.reps
with (security_invoker = true)
as
select id, name, team, company, user_id, created_at
from public.reps;

create view posthog.activities
with (security_invoker = true)
as
select id, type, title, supplier, location, event_date, created_at
from public.activities;

create view posthog.stamps
with (security_invoker = true)
as
select id, rep_id, activity_id, earned_at, source, created_at
from public.stamps;

create view posthog.rep_progress
with (security_invoker = true)
as
select
  rep_id, user_id, team,
  in_person_training_count, in_person_training_minimum, in_person_training_met,
  virtual_training_count,
  supplier_fair_count, supplier_fair_minimum, supplier_fair_met,
  hub_training_count, hub_training_minimum, hub_training_met,
  club_express_count, club_express_minimum, club_express_met,
  quota_count, quota_minimum, quota_met,
  minimums_met, minimums_total, completion_percent, qualified, as_of
from public.rep_progress;

comment on view posthog.reps is 'public.reps without email. PostHog identifies people by user_id.';
comment on view posthog.activities is 'public.activities, as is.';
comment on view posthog.stamps is 'public.stamps, as is.';
comment on view posthog.rep_progress is 'public.rep_progress, as is.';

revoke all on table posthog.reps, posthog.activities, posthog.stamps, posthog.rep_progress from public, anon, authenticated, service_role;
grant usage on schema posthog to posthog_reader;
grant select on table posthog.reps, posthog.activities, posthog.stamps, posthog.rep_progress to posthog_reader;
