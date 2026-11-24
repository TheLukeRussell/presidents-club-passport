-- rep_progress: one row per rep with their count for each kind of stamp, the
-- minimum it needs, whether it's met, and how far they are overall. It's
-- here for PostHog dashboards. The passport itself still works its numbers
-- out in the browser (src/lib/rules.ts), so the two follow the same rules:
--   - Only stamps dated today or earlier count. "Today" is Eastern time,
--     where the program is run from.
--   - Trainings count toward the four only when they're in person. Virtual
--     ones are listed but have no minimum.
--   - Club Express needs both sessions, and only the two set sessions count:
--     Club Express Fall on 2026-10-14 and Club Express Spring on 2027-06-17,
--     the same pairs as CLUB_EXPRESS in src/config.ts. A stamp is unique per
--     rep and activity, so two of them means both.
--   - The minimums below mirror MINIMUMS in src/config.ts. Change both
--     together, and the Club Express sessions with CLUB_EXPRESS.
--
-- security_invoker means the view runs with the rights of whoever queries
-- it, so row-level security still applies: a signed-in rep sees only their
-- own row, and posthog_reader sees what its own policies allow. Without it,
-- a view runs as its owner and would show everyone to anyone who can reach
-- it.
--
-- This migration only creates things. Nothing here drops, truncates or
-- deletes.

create view public.rep_progress
with (security_invoker = true)
as
with today as (
  select (now() at time zone 'America/New_York')::date as as_of
),
counts as (
  select
    s.rep_id,
    count(*) filter (where a.type = 'in_person_training') as in_person_training,
    count(*) filter (where a.type = 'virtual_training') as virtual_training,
    count(*) filter (where a.type = 'supplier_fair') as supplier_fair,
    count(*) filter (where a.type = 'hub_training') as hub_training,
    count(*) filter (
      where a.type = 'club_express'
        and (a.title, a.event_date) in (('Club Express Fall', date '2026-10-14'), ('Club Express Spring', date '2027-06-17'))
    ) as club_express,
    count(*) filter (where a.type = 'quota') as quota
  from public.stamps s
  join public.activities a on a.id = s.activity_id
  where s.earned_at <= (select as_of from today)
  group by s.rep_id
),
progress as (
  select
    r.id as rep_id,
    r.user_id,
    r.team,
    coalesce(c.in_person_training, 0)::int as in_person_training_count,
    coalesce(c.virtual_training, 0)::int as virtual_training_count,
    coalesce(c.supplier_fair, 0)::int as supplier_fair_count,
    coalesce(c.hub_training, 0)::int as hub_training_count,
    coalesce(c.club_express, 0)::int as club_express_count,
    coalesce(c.quota, 0)::int as quota_count
  from public.reps r
  left join counts c on c.rep_id = r.id
),
checked as (
  select
    p.*,
    p.in_person_training_count >= 4 as in_person_training_met,
    p.supplier_fair_count >= 2 as supplier_fair_met,
    p.hub_training_count >= 2 as hub_training_met,
    p.club_express_count >= 2 as club_express_met,
    p.quota_count >= 1 as quota_met
  from progress p
)
select
  c.rep_id,
  c.user_id,
  c.team,
  c.in_person_training_count,
  4 as in_person_training_minimum,
  c.in_person_training_met,
  c.virtual_training_count,
  c.supplier_fair_count,
  2 as supplier_fair_minimum,
  c.supplier_fair_met,
  c.hub_training_count,
  2 as hub_training_minimum,
  c.hub_training_met,
  c.club_express_count,
  2 as club_express_minimum,
  c.club_express_met,
  c.quota_count,
  1 as quota_minimum,
  c.quota_met,
  m.minimums_met,
  5 as minimums_total,
  (m.minimums_met * 20) as completion_percent,
  m.minimums_met = 5 as qualified,
  (select as_of from today) as as_of
from checked c
cross join lateral (
  select (
    c.in_person_training_met::int + c.supplier_fair_met::int + c.hub_training_met::int
    + c.club_express_met::int + c.quota_met::int
  ) as minimums_met
) m;

comment on view public.rep_progress is
  'Per rep: count for each stamp type vs its minimum, minimums met (0-5), completion_percent and qualified. Counts stamps dated today (US Eastern) or earlier.';

-- Signed-in reps may read it (row-level security limits them to their own
-- row). Signed-out visitors may not.
revoke all on table public.rep_progress from anon, authenticated, service_role;
grant select on table public.rep_progress to authenticated, service_role;
