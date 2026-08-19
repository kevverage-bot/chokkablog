-- ============================================================
-- ARCHIVE SEARCH: A SNIPPET THAT SHOWS WHY THE POST MATCHED
--
-- ⚠ THE BUG THIS FIXES, because the symptom looks like "search is broken" and
-- the cause is nowhere near the matching. Searching the archive for "Murphy"
-- returned "GERS 2021 - So What?" — correctly, the post says Richard Murphy —
-- and then showed the reader its opening 240 characters about the Chief
-- Statistician, with nothing marked. `archive_posts.excerpt` is a FIXED opening
-- extract stored once at import; the match was 21,911 characters into a 25,814
-- character post. The list had no way to show the part that matched, because it
-- never fetched it.
--
-- Fetching `plain` instead is not the answer: 25 hits of full body text is
-- several hundred kilobytes on every pause in typing, to display two lines.
--
-- So Postgres cuts the snippet, next to the index that found it. ts_headline
-- takes the same tsquery that matched, which is what makes this better than
-- highlighting in the browser could ever be: the marks land on what ACTUALLY
-- matched, stemming and all. A search for "borrowing" marks "borrow" and
-- "borrowed"; a browser looking for the literal string would mark neither, and
-- the reader would see an unexplained hit.
--
-- Run after 008_archive.sql (needs archive_posts and its fts column).
-- Idempotent: safe to re-run.
-- ============================================================

-- ⚠ SENTINELS, NOT HTML. ts_headline defaults to wrapping matches in <b>, and
-- this text is rendered by React as a string — so anything HTML-shaped would
-- either appear literally as "<b>" or have to be injected as markup, and
-- injecting markup built from a reader's query string into a page is the exact
-- shape of a vulnerability. These two markers are split in the browser and
-- rendered as <mark> ELEMENTS instead (see src/lib/archiveSnippet.ts). The worst
-- case if a post genuinely contains one is a stray highlight, not an injection.
--
-- Kept in step with SNIPPET_OPEN / SNIPPET_CLOSE in that file; a test pins them.
create or replace function public.search_archive(q text, lim integer default 25)
returns table (
  path          text,
  title         text,
  excerpt       text,
  published_at  timestamptz,
  labels        text[],
  comment_count integer
)
language sql
stable
-- SECURITY INVOKER (the default, stated for the avoidance of doubt): the
-- caller's RLS applies. archive_posts is readable by anyone, so this grants
-- nothing that a direct select would not — and if that policy ever tightens,
-- this tightens with it rather than quietly becoming a way around it.
security invoker
set search_path = public, pg_temp
as $$
  select
    a.path,
    a.title,
    -- The snippet, centred on the match. MaxFragments=2 lets two distant
    -- mentions both show, joined by an ellipsis, which is what a long post
    -- needs — the one-fragment version of this still hid the second half.
    ts_headline(
      'english',
      coalesce(a.plain, ''),
      websearch_to_tsquery('english', q),
      'StartSel="[hl]", StopSel="[/hl]", MaxWords=44, MinWords=24, ShortWord=3, '
      || 'MaxFragments=2, FragmentDelimiter=" … ", HighlightAll=FALSE'
    ) as excerpt,
    a.published_at,
    a.labels,
    a.comment_count
  from public.archive_posts a
  where a.fts @@ websearch_to_tsquery('english', q)
  -- Newest first, as the list has always been. NOT by ts_rank, deliberately:
  -- this is an archive of dated commentary, where "the most recent time he
  -- wrote about this" is usually what a reader means, and rank would bury a
  -- 2021 post under a denser 2014 one. Worth revisiting, but as a decision
  -- rather than as a side effect of adding snippets.
  order by a.published_at desc
  limit greatest(1, least(coalesce(lim, 25), 50));
$$;

-- The anon role calls this from the browser, exactly as it selects the table.
grant execute on function public.search_archive(text, integer) to anon, authenticated;
