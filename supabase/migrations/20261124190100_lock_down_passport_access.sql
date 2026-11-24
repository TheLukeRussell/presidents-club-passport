-- Who can read what from the browser.
--
-- The site ships Supabase's anon key in public JavaScript, so these rules are
-- the only thing between the internet and the data. In short:
--   - Signed out (anon): nothing at all.
--   - Signed in and on the roster (authenticated, with a rep row): your own
--     rep row, your own stamps, and the list of activities. Never anyone
--     else's rep row or stamps. A signed-in account that isn't on the roster
--     sees nothing at all.
--   - Nobody writes from the browser. There are no insert, update or delete
--     policies, and the privileges to do so are taken away as well, so a
--     missing policy can't be the only safeguard.
--   - The service role (the import script, run from a laptop) bypasses all
--     of this, as it does everywhere in Supabase. Its key never goes in
--     front-end code or a commit.
--
-- This migration only grants, revokes and creates policies. Nothing here
-- drops, truncates or deletes.

alter table public.reps enable row level security;
alter table public.activities enable row level security;
alter table public.stamps enable row level security;

-- Older Supabase projects grant the API roles everything on new tables in
-- public; newer ones can grant nothing. Either way, start from nothing and
-- say exactly who gets what:
--   - authenticated (a signed-in rep): read only, narrowed by the policies
--     below.
--   - service_role (the attendance importer): read, add and update. No
--     delete or truncate, so even the service role key can't remove a rep,
--     an activity or a stamp through the API.
revoke all on table public.reps, public.activities, public.stamps from anon, authenticated, service_role;
grant select on table public.reps, public.activities, public.stamps to authenticated;
grant select, insert, update on table public.reps, public.activities, public.stamps to service_role;

-- (select auth.uid()) rather than auth.uid(): Postgres works it out once per
-- query instead of once per row, which is Supabase's own advice for policies.

create policy "Reps can read their own rep row"
on public.reps
for select
to authenticated
using (user_id = (select auth.uid()));

create policy "Reps can read their own stamps"
on public.stamps
for select
to authenticated
using (
  rep_id in (select r.id from public.reps r where r.user_id = (select auth.uid()))
);

-- The activities are the program's calendar (event names, suppliers, dates),
-- not anyone's record, so any rep on the roster can read them. Who attended
-- what lives in stamps, which stays private.
create policy "Reps on the roster can read activities"
on public.activities
for select
to authenticated
using (exists (select 1 from public.reps r where r.user_id = (select auth.uid())));
