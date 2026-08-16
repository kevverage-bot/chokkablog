# Database

Schema for chokkablog's own Supabase project. Every file here is written to be
**re-runnable**: `create ... if not exists`, `create or replace`, and
`drop policy if exists` before each `create policy`. Applying the directory in
order against a live database is a no-op if nothing has changed.

Nothing here is destructive, and nothing added here should be. A migration that
can drop a column is a migration that will, on the day someone re-runs the
directory to fix something unrelated.

## Applying

Supabase dashboard → SQL Editor → paste each file → Run, in numerical order.

| File | What it does |
| --- | --- |
| `001_functions.sql` | `update_updated_at()` — the part with no dependency of its own. |
| `002_profiles.sql` | The `profiles` table, the new-account trigger, `is_admin()`, and the RLS that makes `role` unforgeable. |

`is_admin()` sits in the second file rather than the first, which looks
back-to-front until you try it the other way round: its body reads
`public.profiles`, and Postgres validates a `language sql` body at `CREATE`
time, so it cannot be created before that table exists. The order *within*
`002_profiles.sql` is load-bearing for the same reason — table, then rows, then
the function, then the policies that call it.

## First-run checklist

1. Create the project, and put its URL and **anon** key in `.env.local`
   (see `.env.example`). The anon key is public and ships in the JS bundle —
   that is expected, and is exactly why RLS does the real work. The
   **service-role** key must never appear in this repo or in any `VITE_` variable.
2. Run `001_functions.sql`, then `002_profiles.sql`.
3. Auth → Users → add your account.
4. Promote it, once, by hand — see the note at the foot of `002_profiles.sql`.
   Only an admin can grant admin, so this first one cannot be done through the app.
5. Verify the two things most worth getting wrong:

   ```sql
   -- is_admin must be SECURITY DEFINER, or policies on profiles recurse
   select proname, prosecdef from pg_proc where proname = 'is_admin';   -- expect: t

   -- every table in public must have RLS on
   select relname, relrowsecurity from pg_class
    where relnamespace = 'public'::regnamespace and relkind = 'r';      -- expect: all t
   ```

Re-run that second query after adding any table. A `public` table with RLS off
is readable and writable by anyone holding the anon key, which is everyone.

## Conventions

- Admin-writable tables: `using (public.is_admin())` on insert/update/delete.
- Publicly readable content with a draft gate: `using (published or public.is_admin())`,
  so an unpublished row is filtered by the database rather than hidden by the UI.
- Anything the public can *write* (feedback, comments — Phase 4) gets **no** insert
  policy at all. Those writes go through an Edge Function that verifies a captcha
  server-side and inserts with the service-role key. RLS cannot see a captcha
  token, so an anon insert policy would let anyone POST straight at the REST
  endpoint and skip the form.
- Columns that must never be public (a commenter's email) are dropped by a
  **view**, not a policy. RLS filters rows, not columns.
