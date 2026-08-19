-- ============================================================
-- ARCHIVE
-- The old Blogger site (chokkablog.blogspot.com, 2010–2022), rehosted.
--
-- Its own tables rather than more rows in public.insights, for three reasons
-- that would each have forced the split on their own:
--
--   1. THE BODY IS HTML, not the Markdown subset RichText renders. Ten years of
--      hand-written layout does not survive a conversion, so it is stored as it
--      was written and sanitised once, on the way in (scripts/import-archive.py).
--   2. THE HUB WOULD COLLAPSE. src/hooks/usePosts.ts selects every column of
--      every row, because the hub needs the bodies for its excerpts and search
--      runs over them in the browser. Adding 3.2MB of archive HTML to that query
--      would put it on every visitor's first paint. Hence `excerpt` and `plain`
--      as stored columns: the lists and the search never touch `html`.
--   3. IT IS NOT THE SAME KIND OF THING. An archive post is finished. It has no
--      draft state, no slug to choose, and no publish button — the only thing
--      anyone will ever edit is the note at the top of it.
--
-- ⚠ `note` IS KEVIN'S, AND THE IMPORTER MUST NEVER OVERWRITE IT. It is the
-- reason the archive is editable at all: a 2015 post that still ranks gets a
-- line at the top pointing at the current one. The seed's ON CONFLICT clause
-- lists every column except this one; keep it that way.
--
-- Run after 001_functions.sql (update_updated_at) and 002_profiles.sql
-- (is_admin). Idempotent: safe to re-run.
--
-- The rows themselves are NOT here — they are 10MB. See supabase/README.md,
-- "Loading the archive".
-- ============================================================

create table if not exists public.archive_posts (
  id            uuid primary key default gen_random_uuid(),

  -- Blogger's own entry id, e.g. 'tag:blogger.com,1999:blog-16034….post-2304…'.
  -- The import key: it is stable across re-exports, which a title is not.
  blogger_id    text not null unique,

  -- The original path with no leading slash and no '.html': '2015/03/gers-2015'.
  -- ⚠ THIS IS LOAD-BEARING FOR THE WHOLE MIGRATION. The new URL is
  -- /archive/<path>, so every old blogspot address maps to its replacement by
  -- string concatenation alone — no lookup table, and no collision to resolve
  -- (two slugs, 'in-other-news' and 'playing-long-game', are reused across
  -- years, which is exactly why the date stayed in the path).
  path          text not null unique,

  title         text not null,

  -- The post as it was published, sanitised. Rendered as trusted HTML.
  html          text not null,

  -- The same text with the markup taken out, for the full-text index. Stored
  -- rather than derived: Postgres would otherwise index tag names as words, and
  -- the browser never has this column to derive anything from.
  plain         text not null default '',

  -- Two hundred-odd characters of prose for the index page, the search results
  -- and the meta description.
  excerpt       text not null default '',

  -- Kevin's note, in Markdown, shown above the post. See the warning above.
  note          text not null default '',

  labels        text[] not null default '{}',

  -- The original publication date, preserved exactly — including the 2000-08-27
  -- one, which is a backdated post rather than a real date and will sort last.
  published_at  timestamptz not null,

  -- Where it first appeared. Shown on the page: this is a republication, and
  -- saying so plainly is both honest and the thing that makes the old address
  -- meaningful to anyone who arrives holding it.
  original_url  text not null,

  comment_count integer not null default 0,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Title first, body second: a post whose HEADLINE is about the thing outranks
-- one that mentions it in passing, which is the same weighting
-- src/lib/postSearch.ts applies to the blog in the browser.
--
-- ⚠ `labels` IS NOT IN HERE, and cannot be. A generated column accepts only
-- IMMUTABLE expressions, and `array_to_string(text[], text)` is merely STABLE —
-- Postgres refuses the whole statement with "generation expression is not
-- immutable". (`labels::text` is out for the same reason: array_out is stable
-- too.) In practice a label is a word that appears in the post anyway, so the
-- loss is small; the GIN index below is there for filtering BY label, which is
-- what that column is actually for.
alter table public.archive_posts
  drop column if exists fts;
alter table public.archive_posts
  add column fts tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(plain, '')), 'B')
  ) stored;

create index if not exists archive_posts_fts_idx on public.archive_posts using gin (fts);
create index if not exists archive_posts_labels_idx on public.archive_posts using gin (labels);
create index if not exists archive_posts_published_idx on public.archive_posts (published_at desc);

drop trigger if exists archive_posts_updated_at on public.archive_posts;
create trigger archive_posts_updated_at
  before update on public.archive_posts
  for each row execute function public.update_updated_at();

-- ─── Comments, as they were written ───
-- Read-only history. Nothing new is ever inserted here: the archive carries no
-- comment form, and public.comments (007) remains the only way anyone can add
-- one to anything. That is why there is no moderation column and no email —
-- these were moderated in 2016, by Blogger, and the addresses were never in the
-- export in the first place.
create table if not exists public.archive_comments (
  id                  uuid primary key default gen_random_uuid(),
  blogger_id          text not null unique,
  post_id             uuid not null references public.archive_posts (id) on delete cascade,

  -- Blogger's own threading. Kept as the foreign id rather than resolved to a
  -- row: a reply whose parent was deleted or marked spam still has to load, and
  -- an unresolvable id is easier to render as "top level" than a broken FK.
  reply_to_blogger_id text,

  -- Empty for the 1,241 anonymous ones; the page says "Anonymous".
  author_name         text not null default '',
  author_uri          text,

  html                text not null,
  published_at        timestamptz not null,
  created_at          timestamptz not null default now()
);

create index if not exists archive_comments_post_idx
  on public.archive_comments (post_id, published_at asc);

-- ─── RLS ───
-- Everything here is public by construction: it was published on the open web
-- for a decade, and rehosting it is the point. There is no draft gate to apply
-- and no column to hide, so unlike 006/007 the read policy is simply `true`.
alter table public.archive_posts enable row level security;
alter table public.archive_comments enable row level security;

drop policy if exists "Anyone can read the archive" on public.archive_posts;
create policy "Anyone can read the archive"
  on public.archive_posts for select
  using (true);

drop policy if exists "Admins can edit the archive" on public.archive_posts;
create policy "Admins can edit the archive"
  on public.archive_posts for update
  using (public.is_admin());

-- Insert and delete are admin-only rather than absent: the seed is applied as
-- the database owner, but a re-import through the app has to be possible, and
-- an old post occasionally has to go.
drop policy if exists "Admins can add archive posts" on public.archive_posts;
create policy "Admins can add archive posts"
  on public.archive_posts for insert
  with check (public.is_admin());

drop policy if exists "Admins can remove archive posts" on public.archive_posts;
create policy "Admins can remove archive posts"
  on public.archive_posts for delete
  using (public.is_admin());

drop policy if exists "Anyone can read archive comments" on public.archive_comments;
create policy "Anyone can read archive comments"
  on public.archive_comments for select
  using (true);

drop policy if exists "Admins can add archive comments" on public.archive_comments;
create policy "Admins can add archive comments"
  on public.archive_comments for insert
  with check (public.is_admin());

drop policy if exists "Admins can edit archive comments" on public.archive_comments;
create policy "Admins can edit archive comments"
  on public.archive_comments for update
  using (public.is_admin());

-- The one that will actually get used: a comment from 2015 that should not have
-- been republished.
drop policy if exists "Admins can remove archive comments" on public.archive_comments;
create policy "Admins can remove archive comments"
  on public.archive_comments for delete
  using (public.is_admin());
