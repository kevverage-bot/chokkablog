-- ============================================================
-- SHARED FUNCTIONS
--
-- Run this FIRST. Only what has no dependency of its own lives here.
--
-- `is_admin()` is deliberately NOT in this file, even though it is the more
-- important of the two: its body reads public.profiles, and Postgres validates a
-- `language sql` body at CREATE time, so it cannot exist before that table does.
-- It lives at the point in 002_profiles.sql where the table is ready. Nothing is
-- gained by splitting a function from the thing that makes it valid.
--
-- Idempotent: `create or replace`, safe to re-run.
-- ============================================================

-- ─── update_updated_at() ───
-- Keeps `updated_at` honest. Set by the database rather than the client, because
-- a client-set timestamp is a client-forgeable one and the prerenderer publishes
-- it as an article's `dateModified`.
--
-- Attach to every table carrying that column:
--   create trigger <table>_updated_at before update on public.<table>
--     for each row execute procedure public.update_updated_at();
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
