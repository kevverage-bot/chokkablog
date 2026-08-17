-- ============================================================
-- FEEDBACK
-- Reader-submitted feedback from the form in the footer. Written ONLY by the
-- `submit-feedback` Edge Function — see supabase/functions/submit-feedback.
--
-- ⚠ THE RULE THAT MATTERS: there is deliberately NO insert policy, for anyone.
-- The anon key ships in the JS bundle, so an anon INSERT policy would let anyone
-- POST straight at the REST endpoint and never load the form — and RLS cannot
-- see a captcha token, so it has no way to tell a reader from a script. The Edge
-- Function verifies hCaptcha server-side and inserts with the service-role key,
-- which bypasses RLS. That asymmetry IS the spam defence. Keep it.
--
-- Run after 002_profiles.sql (needs is_admin()). Idempotent: safe to re-run.
-- ============================================================

create table if not exists public.feedback (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),

  -- What the reader said. Name and email are optional: plenty of people want to
  -- point out a wrong number without starting a correspondence.
  message     text not null,
  name        text,
  email       text,

  -- Where they were when they said it. The full URL including the query string,
  -- because "this looks wrong" is unreproducible without the view that produced
  -- it; `page` is the bare path so the inbox can group without parsing URLs.
  page        text,
  view_url    text,
  user_agent  text,

  -- A SALTED HASH, never the raw address: enough to rate-limit a repeat sender,
  -- not enough to identify one, and nothing to leak if this table is ever read
  -- by someone who should not have it.
  ip_hash     text,

  -- Triage state, owned by the Admin inbox.
  status      text not null default 'new'
              check (status in ('new', 'read', 'actioned', 'spam')),
  admin_note  text,
  handled_at  timestamptz
);

-- Inbox order.
create index if not exists feedback_created_at_idx
  on public.feedback (created_at desc);

-- The rate-limit lookup the Edge Function makes: this sender, within the hour.
create index if not exists feedback_ip_hash_created_at_idx
  on public.feedback (ip_hash, created_at desc);

-- ─── RLS ───
alter table public.feedback enable row level security;

-- Belt and braces alongside RLS: the anon role has no business touching this
-- table in either direction. (service_role bypasses both, which is the point.)
revoke all on public.feedback from anon;

-- Admins read and triage. No insert policy, by design — see the header.
drop policy if exists "Admins can read feedback" on public.feedback;
create policy "Admins can read feedback"
  on public.feedback for select
  using (public.is_admin());

drop policy if exists "Admins can update feedback" on public.feedback;
create policy "Admins can update feedback"
  on public.feedback for update
  using (public.is_admin());

drop policy if exists "Admins can delete feedback" on public.feedback;
create policy "Admins can delete feedback"
  on public.feedback for delete
  using (public.is_admin());
