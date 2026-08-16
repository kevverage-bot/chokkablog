-- ============================================================
-- INSIGHTS
-- The posts. One row per piece of writing, each with its own page at
-- /insights/<slug>.
--
-- Run after 002_profiles.sql (needs is_admin() and update_updated_at()).
-- Idempotent: safe to re-run.
-- ============================================================

create table if not exists public.insights (
  id           uuid primary key default gen_random_uuid(),

  -- The post's own URL segment: /insights/<slug>.
  --
  -- ⚠ FROZEN ONCE PUBLIC. Editing a headline must never move the page or break a
  -- link to it, so this is set deliberately and never re-derived from the title.
  -- Nullable so a draft can exist before its address is decided; the check below
  -- makes it compulsory at the moment of publishing.
  slug         text,

  headline     text not null default '',

  -- Compact label for where the full headline is too long to read: the browser
  -- tab, the back-button history, and the title in search results (Google cuts
  -- around 60 characters). Empty falls back to the headline, so nothing has to
  -- be filled in for this to work.
  short_title  text not null default '',

  -- The excerpt on the /insights hub AND the page's meta description. Blank
  -- falls back to an auto-excerpt of the opening of `body` — see
  -- src/lib/insightExcerpt.ts. The field exists for posts whose opening line
  -- reads badly out of context.
  summary      text not null default '',

  -- The post itself, in the Markdown subset src/components/RichText.tsx renders.
  body         text not null default '',

  -- Optional small print below the post: sources, caveats, corrections.
  footer       text not null default '',

  -- Draft/live gate, enforced in RLS below rather than by hiding things in the
  -- UI, so an unpublished draft is not merely invisible — it is not served.
  published    boolean not null default false,

  -- When it went live. Set by the trigger below, not by the client: this is
  -- published as the article's `datePublished` in JSON-LD, and a client-set
  -- timestamp is a client-forgeable one. Settable by hand to backdate a post
  -- migrated from the old blog — the trigger only fills it when it is empty.
  published_at timestamptz,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  -- A published post with no address cannot be linked to, shared or indexed.
  -- The database refuses rather than trusting the editor to have checked.
  constraint insights_published_needs_slug
    check (not published or slug is not null)
);

-- One page per slug. Partial, so several drafts may sit at NULL together.
create unique index if not exists insights_slug_key
  on public.insights (slug)
  where slug is not null;

-- The hub's ordering: newest first, drafts (no published_at) by when they were
-- started. Indexed because it is the only ordering the site ever asks for.
create index if not exists insights_published_at_idx
  on public.insights (published_at desc nulls first, created_at desc);

drop trigger if exists insights_updated_at on public.insights;
create trigger insights_updated_at
  before update on public.insights
  for each row execute procedure public.update_updated_at();

-- ─── published_at ───
-- Stamped the first time a post goes live, and never again. Unpublishing
-- deliberately does NOT clear it: pulling a post to fix a typo and putting it
-- back must not silently re-date it to today, or move it to the top of the hub.
create or replace function public.stamp_published_at()
returns trigger
language plpgsql
as $$
begin
  if new.published and new.published_at is null then
    new.published_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists insights_stamp_published_at on public.insights;
create trigger insights_stamp_published_at
  before insert or update on public.insights
  for each row execute procedure public.stamp_published_at();

-- ─── RLS ───
alter table public.insights enable row level security;

-- Anyone reads PUBLISHED posts; drafts are returned to admins only. This is the
-- draft gate, and it lives here rather than in a UI filter — the anon key is in
-- the JS bundle, so anything the API will return is public whatever the app
-- chooses to render.
drop policy if exists "Anyone can read published insights" on public.insights;
create policy "Anyone can read published insights"
  on public.insights for select
  using (published or public.is_admin());

drop policy if exists "Admins can insert insights" on public.insights;
create policy "Admins can insert insights"
  on public.insights for insert with check (public.is_admin());

drop policy if exists "Admins can update insights" on public.insights;
create policy "Admins can update insights"
  on public.insights for update using (public.is_admin());

drop policy if exists "Admins can delete insights" on public.insights;
create policy "Admins can delete insights"
  on public.insights for delete using (public.is_admin());
