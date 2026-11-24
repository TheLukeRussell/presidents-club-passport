-- posthog_reader: the Postgres login PostHog uses to read the passport tables
-- as a data warehouse source, for dashboards.
--
-- What it can do: SELECT on reps, activities, stamps and rep_progress. That's
-- all. It can't write, can't see reps.email, and can't see any other table.
-- Every session it opens is read-only as well, as a second lock.
--
-- No password is set here, because this repo is public. Until you set one by
-- hand, nobody can log in as it. See "Link Supabase in PostHog" in the README.
--
-- This migration only creates things. Nothing here drops, truncates or
-- deletes.

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

comment on role posthog_reader is 'Read-only login for PostHog''s Postgres source: SELECT on reps (no email), activities, stamps, rep_progress.';

-- A second lock behind the grants: anything it runs is read-only, and a
-- runaway query is stopped after a minute.
alter role posthog_reader set default_transaction_read_only = on;
alter role posthog_reader set statement_timeout = '60s';

grant usage on schema public to posthog_reader;

-- Every reps column except email. PostHog identifies people by user_id (the
-- Supabase sign-in id), so it never needs the address.
grant select (id, name, team, company, user_id, created_at) on table public.reps to posthog_reader;
grant select on table public.activities, public.stamps, public.rep_progress to posthog_reader;

-- Row-level security is on for all three tables, and a role that doesn't
-- bypass it sees no rows unless a policy names it. These let posthog_reader
-- read every row (it still only gets the columns granted above).
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
