-- Ties a Supabase sign-in (auth.users) to its row in reps, by email, so the
-- row-level security rules can say "your own" with reps.user_id. The browser
-- never sets user_id: these functions do, inside the database.
--
-- Only a confirmed sign-in is ever linked: one whose email address has been
-- proved by a link or code sent to it. An account someone made with a rep's
-- address but never confirmed can't claim that rep's passport.
--
-- It works in either order:
--   - A rep's sign-in is confirmed (the importer creates it confirmed, or
--     they confirm it): it finds their rep row.
--   - A confirmed sign-in exists and the rep is added later: the new rep row
--     finds it.
--
-- It also adds an optional "only reps on the roster can sign up" check, as a
-- Supabase Auth hook. It's only needed if sign-ups are left on, and it does
-- nothing until you switch it on (see README).
--
-- This migration only creates things. Nothing here drops, truncates or
-- deletes.

-- A rep row being added picks up a sign-in that already exists for its email.
-- Runs as the function's owner (security definer) because only that role can
-- read auth.users. search_path is empty so every name is fully qualified and
-- nothing can be swapped in ahead of it.
create function public.reps_link_existing_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.user_id is null then
    select u.id into new.user_id
    from auth.users u
    where lower(btrim(u.email)) = new.email
      and u.email_confirmed_at is not null
      and not exists (select 1 from public.reps r where r.user_id = u.id)
    limit 1;
  end if;
  return new;
end;
$$;

create trigger reps_link_existing_user
before insert or update of email on public.reps
for each row execute function public.reps_link_existing_user();

-- A sign-in claims the rep row with its email once it's confirmed, if that
-- row isn't claimed yet. It runs inside Supabase Auth's own sign-up and sign-in
-- writes, and an error here would block sign-in, so it never raises: a sign-in
-- that already has a rep row is left alone.
create function public.link_new_user_to_rep()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email_confirmed_at is null then
    return new;
  end if;
  update public.reps
  set user_id = new.id
  where email = lower(btrim(new.email))
    and user_id is null
    and not exists (select 1 from public.reps r where r.user_id = new.id);
  return new;
end;
$$;

create trigger link_new_user_to_rep
after insert or update of email_confirmed_at on auth.users
for each row execute function public.link_new_user_to_rep();

-- Optional: only let people sign up whose email is already in reps. Without
-- it, anyone can request a sign-in link with the public anon key. They still
-- can't see anything (row-level security), but they'd get an account and
-- the project would send them an email. Switch it on in the Supabase
-- dashboard under Authentication, then Hooks, "Before User Created", pointing
-- at this function. It only runs for emails with no account yet, so it never
-- locks out someone who already signed in.
--
-- Written the way Supabase's hook docs ask: it runs as supabase_auth_admin
-- (the role Supabase Auth connects as), which gets just enough to read the
-- roster's emails, and nobody else can call it.
create function public.hook_only_roster_sign_ups(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  signing_up text := lower(btrim(coalesce(event -> 'user' ->> 'email', '')));
begin
  if signing_up <> '' and exists (select 1 from public.reps r where r.email = signing_up) then
    return '{}'::jsonb;
  end if;
  -- The message has to be non-empty, or Supabase Auth ignores the refusal.
  return jsonb_build_object(
    'error', jsonb_build_object(
      'http_code', 403,
      'message', 'That email isn''t on the President''s Club roster. Ask the program team to add you.'
    )
  );
end;
$$;

grant usage on schema public to supabase_auth_admin;
grant select (email) on table public.reps to supabase_auth_admin;
create policy "Supabase Auth can check the roster"
on public.reps
for select
to supabase_auth_admin
using (true);

-- None of these should be callable through the API. The two trigger
-- functions only ever run as triggers. The hook is called by Supabase Auth.
revoke all on function public.reps_link_existing_user() from public, anon, authenticated, service_role;
revoke all on function public.link_new_user_to_rep() from public, anon, authenticated, service_role;
revoke all on function public.hook_only_roster_sign_ups(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.hook_only_roster_sign_ups(jsonb) to supabase_auth_admin;
