-- ============================================================
-- HOME PAGE
-- The words on the home page, and the tools grid beneath them.
--
-- Both were constants compiled into the JS bundle until now, which made a
-- wording change a code change and a deploy. They are content, so they move
-- here — the same shape as insights: read by anyone, written by an admin.
--
-- Run after 002_profiles.sql (needs is_admin() and update_updated_at()).
-- Idempotent: safe to re-run. The seeds below carry today's live wording, and
-- fire only into an empty table, so re-running never overwrites an edit.
-- ============================================================

-- ─── 1. The text ───
create table if not exists public.home_content (
  -- One row, forever. A boolean primary key with `check (id)` is the smallest
  -- way to say that: `true` is the only value the check admits, and the primary
  -- key admits it once. So there can never be two versions of the home page for
  -- the app to have to choose between, and the client can `select` without an
  -- id and `update` without knowing one.
  id            boolean primary key default true check (id),

  -- The chip above the intro — "Coming soon" today. Blank hides it entirely,
  -- which is how it comes off once there is writing to read: an edit, not a
  -- deploy.
  badge         text not null default '',

  -- The standfirst, in the same Markdown subset RichText renders everywhere
  -- else (see src/components/RichText.tsx).
  intro         text not null default '',

  -- The label over the tools grid.
  tools_heading text not null default 'Tools',

  updated_at    timestamptz not null default now()
);

drop trigger if exists home_content_updated_at on public.home_content;
create trigger home_content_updated_at
  before update on public.home_content
  for each row execute procedure public.update_updated_at();

-- Today's wording, so applying this file changes nothing a visitor can see.
-- `do nothing` on conflict: the second run must not undo the first edit.
insert into public.home_content (id, badge, intro, tools_heading)
values (
  true,
  'Coming soon',
  'Data-driven analysis of Scotland’s economy and the case being made for Scottish independence.',
  'Tools'
)
on conflict (id) do nothing;

-- ─── 2. The tools ───
-- Each of these is a separate application on its own subdomain, not a page of
-- this site, so a tool is a name and an outbound link — there is nothing here
-- for the site to render beyond the card.
create table if not exists public.tools (
  id          uuid primary key default gen_random_uuid(),
  name        text not null default '',
  description text not null default '',
  url         text not null default '',

  -- A tool that exists but is not ready to be sent traffic. The card renders as
  -- plain text rather than a link, so nothing on the home page can silently
  -- become a dead end.
  wip         boolean not null default false,

  -- The grid's order, low first. Not alphabetical and not by date: which tool a
  -- first-time reader should open first is an editorial decision, and the only
  -- place it can be recorded is here.
  sort_order  integer not null default 0,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- A card that is not marked work-in-progress renders as a link, and a link
  -- with no address is a dead end on the front page. The database refuses
  -- rather than trusting the editor to have checked — the same bargain as
  -- insights_published_needs_slug.
  constraint tools_link_needs_url check (wip or url <> '')
);

-- created_at breaks the tie, so two tools left on the same sort_order still
-- come back in a stable order rather than swapping about between loads.
create index if not exists tools_sort_order_idx
  on public.tools (sort_order, created_at);

drop trigger if exists tools_updated_at on public.tools;
create trigger tools_updated_at
  before update on public.tools
  for each row execute procedure public.update_updated_at();

-- The four tools as they stand today. Seeded only into an empty table: the
-- NOT EXISTS is uncorrelated, so it is evaluated once for the statement and
-- either all four rows go in or none do.
insert into public.tools (name, description, url, wip, sort_order)
select * from (values
  ('Pooling & Sharing', 'UK regional fiscal transfers',    'https://cra.chokkablog.com',  false, 0),
  ('GERS Explorer',     'Revenue, spending & deficit',     'https://gers-explorer.com',   true,  1),
  ('OECD Benchmarks',   'International comparisons',       'https://oecd.chokkablog.com', false, 2),
  ('CfD Mapping',       'Contracts for difference analysis', 'https://www.cfd-hub.com/',  false, 3)
) as seed (name, description, url, wip, sort_order)
where not exists (select 1 from public.tools);

-- ─── 3. RLS ───
-- Both tables are the front page: readable by everyone, including a crawler
-- with no session, and writable only by an admin.
alter table public.home_content enable row level security;
alter table public.tools enable row level security;

drop policy if exists "Anyone can read home content" on public.home_content;
create policy "Anyone can read home content"
  on public.home_content for select
  using (true);

-- No insert policy: the single row is seeded above and is never created by the
-- app. Nothing in the client has any reason to make a second one, and the
-- check constraint would refuse it anyway.
drop policy if exists "Admins can update home content" on public.home_content;
create policy "Admins can update home content"
  on public.home_content for update using (public.is_admin());

drop policy if exists "Anyone can read tools" on public.tools;
create policy "Anyone can read tools"
  on public.tools for select
  using (true);

drop policy if exists "Admins can insert tools" on public.tools;
create policy "Admins can insert tools"
  on public.tools for insert with check (public.is_admin());

drop policy if exists "Admins can update tools" on public.tools;
create policy "Admins can update tools"
  on public.tools for update using (public.is_admin());

drop policy if exists "Admins can delete tools" on public.tools;
create policy "Admins can delete tools"
  on public.tools for delete using (public.is_admin());
