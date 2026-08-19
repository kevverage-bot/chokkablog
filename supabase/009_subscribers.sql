-- ============================================================
-- SUBSCRIBERS
-- People who asked to be told when there is a new post worth their attention.
--
-- ⚠ WHAT THIS TABLE IS FOR, because it is easy to mistake: Kit holds the mailing
-- list and does the sending. This is the CONSENT RECORD and the escape hatch —
-- who asked, when, from which page, and by what route. Under UK GDPR/PECR the
-- burden is on the sender to show consent was given; "Kit has them" is not a
-- record you control, and Kit's free tier is generous until the day it is not.
-- Keeping our own copy is what makes changing provider a decision rather than a
-- negotiation.
--
-- It is NOT the list. Kit is the source of truth for who is actually subscribed:
-- a row here says someone asked, not that they confirmed, and an unsubscribe
-- happening inside Kit's footer link never reaches this table unless something
-- is built to carry it. See `status` below.
--
-- ⚠ Same rule as public.feedback and public.comments: NO insert policy, for
-- anyone. Rows arrive only through the `subscribe` Edge Function, which verifies
-- the captcha server-side and inserts with the service-role key. RLS cannot see
-- a captcha token, and the anon key ships in the JS bundle, so an anon INSERT
-- policy would let anyone POST at the REST endpoint and never load the form.
--
-- ⚠ AND A RULE OF ITS OWN: every row here is a bare email address, which is more
-- than either of the other two tables can leak. `feedback.email` is optional and
-- `comments.email` is hidden behind a view; this table has no public face at all
-- and must never grow one. There is no select policy for anon, no view, and
-- nothing here is prerendered.
--
-- Run after 002_profiles.sql (needs is_admin()). Idempotent: safe to re-run.
-- ============================================================

create table if not exists public.subscribers (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),

  -- ⚠ NORMALISED TO LOWER CASE, and the check makes that an invariant rather
  -- than a habit. Two reasons it is enforced here: `Kevin@x.com` and
  -- `kevin@x.com` are one person and must not become two rows, and a plain
  -- unique constraint (rather than a unique index on `lower(email)`) is the only
  -- kind PostgREST can upsert against — which is what lets a repeat sign-up be a
  -- no-op instead of an error. The Edge Function lowercases before inserting.
  email         text not null unique
                check (email = lower(email)),

  -- ─── The consent record ───
  -- WHERE they were standing when they asked. A bare consent timestamp with no
  -- context is a much weaker record than one that can name the page and the
  -- wording that was on it.
  source        text not null default 'site'
                check (source in ('site', 'import', 'admin')),
  source_page   text,
  view_url      text,
  user_agent    text,

  -- A SALTED HASH, never the raw address — see 006_feedback.sql. Note the
  -- asymmetry that is deliberate: we hash the IP for rate limiting while storing
  -- the email in the clear, because the email IS the thing being consented to
  -- and the IP is not.
  ip_hash       text,

  -- ─── State ───
  -- 'pending'      — asked here; whether Kit accepted the handover is not known
  -- 'confirmed'    — known to have double opted in
  -- 'unsubscribed' — known to have left
  -- 'failed'       — set BY HAND only. Nothing writes it: the handover to Kit
  --                  happens in the reader's browser (Kit quarantines anything
  --                  from a datacentre IP — see supabase/functions/subscribe),
  --                  and the browser cannot write to this table. A sign-up that
  --                  Kit refused therefore leaves a 'pending' row, which is
  --                  honest: they asked, and they are not on the list.
  --
  -- ⚠ READ 'pending' AS "NOT KNOWN TO BE CONFIRMED", NOT AS "NOT CONFIRMED".
  -- Kit owns the confirmation click, so this column is only as current as
  -- whatever writes back to it. Until something does, a row stays 'pending'
  -- forever and that is not a bug. Never use this column to decide who to email
  -- — Kit decides that — only to answer "did this person ask, and when".
  status        text not null default 'pending'
                check (status in ('pending', 'confirmed', 'unsubscribed', 'failed')),
  confirmed_at  timestamptz,

  -- Kit's own id for this person, when the handover returned one. The join back
  -- to the list if this table ever has to be reconciled against it.
  kit_subscriber_id text,
  -- Why a handover failed, for the row that needs chasing by hand.
  kit_error     text,

  admin_note    text
);

-- ⚠ ONE ROW PER PERSON. The `unique` on the column above is what makes a repeat
-- sign-up an upsert rather than a duplicate or an error: somebody who signed up
-- in March and forgot is not doing anything wrong in August, and must not be
-- shown a failure. The Edge Function's on_conflict clause names that constraint.

-- Admin list order.
create index if not exists subscribers_created_at_idx
  on public.subscribers (created_at desc);

-- The rate-limit lookup the Edge Function makes: this sender, within the hour.
create index if not exists subscribers_ip_hash_created_at_idx
  on public.subscribers (ip_hash, created_at desc);

-- ─── RLS ───
alter table public.subscribers enable row level security;

-- Belt and braces alongside RLS. The anon role has no business touching this
-- table in either direction, and this is the table where that matters most.
-- (service_role bypasses both, which is the point.)
revoke all on public.subscribers from anon;

-- Admins read the list. No insert policy, by design — see the header.
drop policy if exists "Admins can read subscribers" on public.subscribers;
create policy "Admins can read subscribers"
  on public.subscribers for select
  using (public.is_admin());

drop policy if exists "Admins can update subscribers" on public.subscribers;
create policy "Admins can update subscribers"
  on public.subscribers for update
  using (public.is_admin());

-- Deletion is a real requirement here, not housekeeping: an erasure request
-- under UK GDPR has to be honourable in both places, and Kit's dashboard only
-- covers one of them.
drop policy if exists "Admins can delete subscribers" on public.subscribers;
create policy "Admins can delete subscribers"
  on public.subscribers for delete
  using (public.is_admin());
