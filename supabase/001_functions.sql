-- ============================================================
-- SHARED FUNCTIONS
--
-- Run this FIRST. Everything else in this directory depends on it: every RLS
-- policy on every admin-writable table is `using (public.is_admin())`, and every
-- table with an `updated_at` hangs a trigger off `public.update_updated_at()`.
--
-- On GERS Explorer these two were created by hand in the Supabase dashboard and
-- so exist nowhere in source — which means the security model of the whole site
-- lives in a text box no one can review or re-create. They are in git here.
--
-- Idempotent: `create or replace` throughout, safe to re-run.
-- ============================================================

-- ─── is_admin() ───
-- The single authority on who may write. Called from RLS policies, so it runs
-- for every anonymous visitor too and must be cheap and total.
--
-- SECURITY DEFINER is required, not stylistic: the function reads
-- public.profiles, which is itself under RLS, and a policy on profiles that
-- called an invoker-rights is_admin() would recurse. As a definer function it
-- runs as its owner and bypasses RLS, so the policies below don't.
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

-- ─── update_updated_at() ───
-- Keeps `updated_at` honest. Set by the database rather than the client, because
-- a client-set timestamp is a client-forgeable one and the prerenderer publishes
-- it as an article's `dateModified`.
create or replace function public.update_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.update_updated_at() is
  'BEFORE UPDATE trigger: stamps updated_at with now(). Attach to every table carrying that column.';
