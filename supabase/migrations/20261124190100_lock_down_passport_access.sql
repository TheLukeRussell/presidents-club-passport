-- Who can read what from the browser.
--
-- The site ships Supabase's anon key in public JavaScript, so these rules are
-- the only thing between the internet and the data. In short:
--   - Signed out (anon): nothing at all.
--   - Signed in (authenticated): your own rep row, your own stamps, and the
--     list of activities. Never anyone else's rep row or stamps.
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

-- Supabase grants anon and authenticated everything on new tables in public
-- by default. Start from nothing and add back only reads for signed-in reps.
revoke all on table public.reps, public.activities, public.stamps from anon, authenticated;
grant select on table public.reps, public.activities, public.stamps to authenticated;

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
-- not anyone's record, so any signed-in rep can read them. Who attended what
-- lives in stamps, which stays private.
create policy "Signed-in reps can read activities"
on public.activities
for select
to authenticated
using (true);
