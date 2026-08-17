-- ============================================================
-- COMMENTS
-- Reader comments beneath a post, and the author's replies to them. Nothing
-- appears publicly until it has been approved, so this table is a moderation
-- queue that happens to have a public face.
--
-- ⚠ Same rule as public.feedback: NO insert policy for a reader. Comments arrive
-- only through the `submit-comment` Edge Function, which verifies the captcha
-- server-side and inserts with the service-role key. RLS cannot see a captcha
-- token, and the anon key is in the JS bundle, so an anon INSERT policy would
-- let anyone POST at the REST endpoint and skip the form entirely.
--
-- ⚠ SECOND RULE, EQUALLY LOAD-BEARING: the reader's email is collected and NEVER
-- published. RLS filters ROWS, not COLUMNS, so a public select policy on this
-- table would expose the address behind every approved comment. Hence the split
-- below — the base table is admin-only in every direction, and the public reads
-- a VIEW that does not select the column at all.
--
-- `post_id` references public.insights: the table kept its old name when the
-- section was renamed to Blog. See the note at the top of src/hooks/usePosts.ts.
--
-- Run after 003_insights.sql (needs the posts) and 002_profiles.sql (is_admin()).
-- Idempotent: safe to re-run.
-- ============================================================

create table if not exists public.comments (
  id           uuid primary key default gen_random_uuid(),
  post_id      uuid not null references public.insights (id) on delete cascade,
  created_at   timestamptz not null default now(),

  -- Shown publicly.
  author_name  text not null,
  body         text not null,

  -- NEVER shown publicly. Required so there is a real person behind a comment
  -- and so the author can reply off-list; it stays inside the admin view.
  email        text,

  -- Set when this row answers another. The author replying in public is just
  -- another row with a parent, so moderation, deletion and the public view all
  -- work on it unchanged.
  parent_id    uuid references public.comments (id) on delete cascade,

  -- The author answering, badged rather than shown as a peer.
  is_author    boolean not null default false,

  -- Moderation. 'pending' is the default: a comment is invisible until approved.
  status       text not null default 'pending'
               check (status in ('pending', 'approved', 'rejected', 'spam')),
  approved_at  timestamptz,
  admin_note   text,

  -- Context, as for feedback. ip_hash is salted — see 006_feedback.sql.
  view_url     text,
  user_agent   text,
  ip_hash      text,

  -- An author's reply is written from Admin and has no address to collect; a
  -- reader's comment must have one. Enforced here rather than trusted to the
  -- Edge Function, because this is the only place both paths meet.
  constraint comments_reader_needs_email
    check (is_author or email is not null)
);

create index if not exists comments_post_idx
  on public.comments (post_id, created_at asc);
create index if not exists comments_status_idx
  on public.comments (status, created_at desc);
create index if not exists comments_parent_idx
  on public.comments (parent_id);
-- The Edge Function's rate-limit lookup.
create index if not exists comments_ip_hash_created_at_idx
  on public.comments (ip_hash, created_at desc);

-- ─── RLS: the base table is admins only, in every direction ───
alter table public.comments enable row level security;
revoke all on public.comments from anon;

drop policy if exists "Admins can read comments" on public.comments;
create policy "Admins can read comments"
  on public.comments for select
  using (public.is_admin());

-- ⚠ The ONLY insert policy on this table, and it must stay admin-only: that
-- readers cannot insert is what makes the captcha enforceable. This grants the
-- author the right to write a reply directly from Admin; a reader's comment
-- still arrives only through the Edge Function's service-role client.
drop policy if exists "Admins can post replies" on public.comments;
create policy "Admins can post replies"
  on public.comments for insert
  with check (public.is_admin());

drop policy if exists "Admins can update comments" on public.comments;
create policy "Admins can update comments"
  on public.comments for update
  using (public.is_admin());

drop policy if exists "Admins can delete comments" on public.comments;
create policy "Admins can delete comments"
  on public.comments for delete
  using (public.is_admin());

-- ─── The public face ───
-- A view, not a policy, because the email has to be dropped at the COLUMN level
-- and RLS only filters rows. Deliberately left as a DEFINER-rights view (no
-- security_invoker): it runs as its owner, bypasses the admin-only policies
-- above, and returns exactly the approved rows and the safe columns. The WHERE
-- clause and the column list ARE the access control, so there is no query a
-- reader can write — however they mangle the URL — that returns an unapproved
-- comment or anybody's address.
drop view if exists public.comments_public;
create view public.comments_public as
  select id, post_id, parent_id, is_author, author_name, body, created_at, approved_at
  from public.comments
  where status = 'approved';

grant select on public.comments_public to anon, authenticated;
