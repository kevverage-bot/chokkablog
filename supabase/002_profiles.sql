-- ============================================================
-- PROFILES, and the is_admin() that reads them
--
-- Per-user account and role store. `role` drives public.is_admin(), which every
-- write policy in this database calls — so this table is the root of the whole
-- permission model and is treated accordingly.
--
-- ⚠ THE RULE THAT MATTERS: a user has NO client-side write path to their own
-- row. The anon key ships in the JS bundle, so a self-update policy — even one
-- scoped to `auth.uid() = id` — would let anyone set their own role to 'admin'
-- with a single REST call and own the site. Rows are created by the trigger
-- below (SECURITY DEFINER, bypasses RLS) and changed only by an existing admin.
--
-- On GERS Explorer this table was originally created in the dashboard with RLS
-- off, which left it world-readable AND world-writable for a period. Starting
-- from this file instead of a dashboard click is the point.
--
-- ORDER IS LOAD-BEARING within this file: the table, then the rows, then
-- is_admin() (whose body cannot be validated until the table exists), then the
-- policies (which cannot be created until is_admin() exists).
--
-- Run after 001_functions.sql. Idempotent: safe to re-run.
-- ============================================================

-- ─── 1. The table ───
create table if not exists public.profiles (
  -- Not just a foreign key: the same uuid as auth.users, so `auth.uid() = id`
  -- is the whole join. ON DELETE CASCADE so removing an account removes this.
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text not null,
  full_name  text,

  -- 'pending' is the default and it is deliberately useless: a new account can
  -- sign in and see exactly what a signed-out visitor sees until someone
  -- promotes it. There is no self-service path to 'admin'.
  role       text not null default 'pending'
             check (role in ('pending', 'user', 'admin')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at
  before update on public.profiles
  for each row execute procedure public.update_updated_at();

-- ─── 2. New accounts get a row automatically ───
-- SECURITY DEFINER so it can insert past the admin-only policy added below.
-- Without this, a newly created account has no profile at all and useAuth()
-- reports no role — which is safe, but looks like a bug.
--
-- ON CONFLICT DO NOTHING so re-running this file, or any future replay of the
-- trigger, cannot fail a sign-up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ─── 3. Backfill accounts that predate the trigger ───
-- The trigger only fires on INSERT, so any account created before this file was
-- first run — including the very first one, made in the dashboard to bootstrap
-- an admin — has no profile row and therefore no role. That looks exactly like a
-- broken sign-in: authentication succeeds and the app still shows you as nobody.
--
-- Runs as the table owner (the SQL editor does), so RLS does not apply. Guarded
-- by ON CONFLICT, so re-running is a no-op and this can never overwrite a role
-- that has since been set.
insert into public.profiles (id, email, full_name)
select u.id, u.email, u.raw_user_meta_data ->> 'full_name'
  from auth.users as u
 on conflict (id) do nothing;

-- ─── 4. is_admin() ───
-- The single authority on who may write, called from every RLS policy in this
-- database. It therefore runs for every anonymous visitor too, and must be cheap
-- and total.
--
-- It is defined HERE, rather than alongside update_updated_at() in
-- 001_functions.sql, because a `language sql` body is validated at CREATE time:
-- the function cannot be created before public.profiles exists.
--
-- SECURITY DEFINER is required, not stylistic: profiles is itself under RLS, and
-- a policy on profiles calling an invoker-rights is_admin() would recurse. As a
-- definer function it runs as its owner and bypasses RLS, so the policies below
-- do not.
--
-- `set search_path` is the other half of that: a SECURITY DEFINER function with
-- an inherited search_path can be hijacked by a caller who creates their own
-- `profiles` table in a schema earlier on the path. Pinning it removes that.
--
-- Verify it really is definer-rights after any change:
--   select prosecdef from pg_proc where proname = 'is_admin';  -- expect: t
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.profiles
     where id = auth.uid()
       and role = 'admin'
  );
$$;

comment on function public.is_admin() is
  'True when the calling user has profiles.role = admin. SECURITY DEFINER so RLS policies on profiles do not recurse. The authority for every write policy in this database.';

-- Anonymous visitors evaluate this on every public read, so both roles need it.
grant execute on function public.is_admin() to anon, authenticated;

-- ─── 5. RLS ───
alter table public.profiles enable row level security;

-- Read: your own row, or everything if you are an admin. Anonymous visitors
-- match nothing (auth.uid() is null), so this table is not public.
drop policy if exists "Users read own profile" on public.profiles;
create policy "Users read own profile"
  on public.profiles for select
  using (auth.uid() = id or public.is_admin());

-- Write: admins only, in all three directions. See the warning at the top —
-- do not add a self-update policy, however narrowly scoped.
drop policy if exists "Admins insert profiles" on public.profiles;
create policy "Admins insert profiles"
  on public.profiles for insert with check (public.is_admin());

drop policy if exists "Admins update profiles" on public.profiles;
create policy "Admins update profiles"
  on public.profiles for update using (public.is_admin());

drop policy if exists "Admins delete profiles" on public.profiles;
create policy "Admins delete profiles"
  on public.profiles for delete using (public.is_admin());

-- ─── 6. Bootstrapping the first admin ───
-- Chicken and egg: only an admin can grant admin, and there isn't one yet. So
-- the first promotion is done by hand, once, in the SQL editor — which runs as
-- the table owner and bypasses RLS. Create the account in Auth > Users first,
-- then run:
--
--   update public.profiles set role = 'admin' where email = 'you@example.com';
--
-- Confirm exactly one admin exists afterwards:
--
--   select email, role from public.profiles order by role;
