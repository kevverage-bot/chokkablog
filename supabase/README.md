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
| `003_insights.sql` | The `insights` table: slugs, the draft gate, and the `published_at` stamp. |
| `004_post_images.sql` | The public `post-images` storage bucket and its policies. |
| `005_home.sql` | `home_content` (one row: badge, intro, tools heading) and `tools` — the home page, made editable. Seeds today's wording, so applying it changes nothing a visitor sees. |
| `006_feedback.sql` | The `feedback` table: the footer form's inbox. No insert policy for anyone — see below. |
| `007_comments.sql` | The `comments` table, the moderation queue, and `comments_public` — the view that drops the email. |

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
- Anything the public can *write* (feedback, comments) gets **no** insert policy at
  all. Those writes go through an Edge Function that verifies a captcha
  server-side and inserts with the service-role key. RLS cannot see a captcha
  token, so an anon insert policy would let anyone POST straight at the REST
  endpoint and skip the form.
- Columns that must never be public (a commenter's email) are dropped by a
  **view**, not a policy. RLS filters rows, not columns.

## The public write path

Two Edge Functions, in `functions/`, are the only way a stranger's words reach
this database: `submit-feedback` (the footer form) and `submit-comment` (beneath a
post). They share `functions/_shared/guard.ts` — honeypot → time-on-form →
captcha → rate limit, in that order, so a script that cannot pass the captcha
never costs a query.

**Both fail closed.** With no `HCAPTCHA_SECRET` set, the guard refuses every
write with a 503, because an unprotected public insert is the worse failure. The
app matches that: with no `VITE_HCAPTCHA_SITE_KEY` it does not render the forms at
all rather than throwing away what somebody typed into one
(`src/lib/captcha.ts`). **So until hCaptcha is configured, there are no forms on
the site** — which is the intended state, not a bug.

### Turning it on

1. Create a site at [hcaptcha.com](https://dashboard.hcaptcha.com) for
   `chokkablog.com`. It gives you a **site key** (public) and a **secret**.
2. Site key → `VITE_HCAPTCHA_SITE_KEY`, in `.env.local` **and** in Vercel's
   project env vars (it is compiled into the bundle, so a deploy is needed).
   Supabase Auth → Attack Protection can take the same key, which is what makes
   the sign-in form require a captcha too.
3. Secret and the mail settings → function secrets:

   ```bash
   npx supabase link --project-ref <ref>          # once
   npx supabase secrets set HCAPTCHA_SECRET=ES_… \
                            RESEND_API_KEY=re_… \
                            FEEDBACK_TO_EMAIL=you@example.com
   ```

   `RESEND_API_KEY` / `FEEDBACK_TO_EMAIL` are optional: without them a submission
   is still stored, it just does not email you. Optional too:
   `FEEDBACK_FROM_EMAIL`, `FEEDBACK_ADMIN_URL`, `FEEDBACK_IP_SALT` (which
   defaults to the service-role key).
4. Deploy them:

   ```bash
   npx supabase functions deploy submit-feedback
   npx supabase functions deploy submit-comment
   ```

   `_shared/` is bundled into each automatically. **A change to `guard.ts` needs
   both redeployed** — that is the one thing about sharing a file this way that
   will catch you out.

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided by the platform; do
not set them, and never put the service-role key in this repo or in any `VITE_`
variable.

## Rebuilding after publishing

The site is prerendered, so `sitemap.xml`, `rss.xml` and each post's real HTML
are written during a **build**. Publishing a post in Admin makes it live for
readers immediately and leaves it invisible to Google, feed readers and link
previews until the next deploy. Two things close that gap:

- **Admin → Search & feeds → Rebuild now**, which counts what has changed since
  the last build and starts one.
- **A nightly rebuild** at 04:10 UTC (`crons` in vercel.json → `/api/rebuild`),
  so a forgotten click costs a day rather than forever.

Both ring the same doorbell: a **Vercel Deploy Hook**.

### Turning it on

1. Vercel → Settings → Git → **Deploy Hooks** → create one on `main`, called
   something like `rebuild`. It gives you a URL.

   ⚠ **That URL is a credential.** Anyone holding it can start builds on the
   project. It never goes anywhere a browser can read it — which is exactly why
   the Admin button goes through an Edge Function rather than calling the hook
   directly.

2. Give the URL to the Edge Function, and deploy it:

   ```bash
   npx supabase secrets set --project-ref <ref> \
     VERCEL_DEPLOY_HOOK_URL='https://api.vercel.com/v1/integrations/deploy/…'
   npx supabase functions deploy trigger-rebuild --project-ref <ref> --use-api
   ```

3. Give the same URL to the nightly cron, in Vercel → Settings → Environment
   Variables:

   | Name | Value |
   | --- | --- |
   | `DEPLOY_HOOK_URL` | the same hook URL |
   | `CRON_SECRET` | any long random string (`openssl rand -hex 32`) |

   Vercel sends `CRON_SECRET` as a Bearer token with every scheduled call, and
   `/api/rebuild` refuses anything else. With no secret set it refuses
   everything, rather than becoming a build trigger anyone can hammer.

### Checking it works

```sql
-- Nothing may be insertable by the anon role, in either table.
select grantee, privilege_type from information_schema.role_table_grants
 where table_name in ('feedback','comments') and grantee = 'anon';   -- expect: no rows

-- The public view must not expose an address.
select column_name from information_schema.columns
 where table_name = 'comments_public';        -- expect: no 'email'
```
