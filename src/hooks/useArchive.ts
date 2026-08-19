import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

/**
 * Reading the archive — the old Blogger site, rehosted (supabase/008_archive.sql).
 *
 * ⚠ THE BODIES ARE NEVER FETCHED IN BULK. 229 posts come to 3.2MB of HTML, so
 * every list here selects `LIST_COLUMNS` and one post's `html` arrives only when
 * a reader opens that post. This is the single rule the whole section is shaped
 * around; a `select('*')` on a list would put the entire archive on the wire.
 *
 * Contrast usePosts, which does select everything: the blog is small, its hub
 * needs the bodies for excerpts, and its search runs over them in the browser.
 * The archive is a hundred times the text and searches in Postgres instead.
 */

/** What a list needs, and nothing more. */
const LIST_COLUMNS = 'path,title,excerpt,published_at,labels,comment_count'

export interface ArchiveSummary {
  /** Blogger's own `YYYY/MM/slug`. The permalink is /archive/<path>. */
  path: string
  title: string
  excerpt: string
  /** The original publication date, preserved exactly. */
  published_at: string
  labels: string[]
  comment_count: number
}

export interface ArchiveComment {
  id: string
  blogger_id: string
  /** The comment this answers, by Blogger id — null at top level, and left
   *  unresolved when the parent is not in the export. */
  reply_to_blogger_id: string | null
  /** Empty for the anonymous ones; the page says "Anonymous". */
  author_name: string
  author_uri: string | null
  html: string
  published_at: string
}

export interface ArchivePost extends ArchiveSummary {
  id: string
  /** The post as published, sanitised at import. Rendered as trusted HTML. */
  html: string
  /** Kevin's note, in Markdown, shown above the post. */
  note: string
  original_url: string
  comments: ArchiveComment[]
}

const COMMENT_COLUMNS = 'id,blogger_id,reply_to_blogger_id,author_name,author_uri,html,published_at'

/** Every archive post, newest first — titles and excerpts only. */
export function useArchiveIndex() {
  const [posts, setPosts] = useState<ArchiveSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const { data, error } = await supabase
        .from('archive_posts')
        .select(LIST_COLUMNS)
        .order('published_at', { ascending: false })
      if (cancelled) return
      if (error) {
        console.error('Failed to load the archive:', error.message)
        setError(error.message)
      } else {
        setError(null)
        setPosts((data ?? []) as ArchiveSummary[])
      }
      setLoading(false)
    }
    void load()
    return () => { cancelled = true }
  }, [])

  return { posts, loading, error }
}

/**
 * One archive post and its comments, in a single round trip.
 *
 * The comments are embedded rather than fetched separately: they are part of
 * the page's content, and a second request would leave the discussion popping in
 * under a post a reader has already started reading.
 */
export function useArchivePost(path: string) {
  // The loaded row is stored WITH the path it was loaded for, and `loading` is
  // derived from the two disagreeing. Resetting state in the effect instead
  // would mean rendering the previous post for a frame every time a reader
  // opened another one, and React 19 rightly complains about the cascade.
  const [loaded, setLoaded] = useState<{ path: string; post: ArchivePost | null } | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const { data, error } = await supabase
        .from('archive_posts')
        .select(`*, comments:archive_comments(${COMMENT_COLUMNS})`)
        .eq('path', path)
        .order('published_at', { referencedTable: 'archive_comments', ascending: true })
        .maybeSingle()
      if (cancelled) return
      if (error) console.error('Failed to load the archive post:', error.message)
      setLoaded({ path, post: (data as ArchivePost | null) ?? null })
    }
    void load()
    return () => { cancelled = true }
  }, [path])

  const settled = loaded?.path === path
  return { post: settled ? loaded.post : null, loading: !settled }
}

/**
 * Full-text search across the archive, in Postgres.
 *
 * `websearch` mode so the query language a reader already knows works: bare
 * words are ANDed, "quoted phrases" stay together, and `-word` excludes. That
 * matches what lib/postSearch does to the blog closely enough that one search
 * box can drive both without explaining itself twice.
 *
 * Ranking is the index's own weighting (title, then body) — see the generated
 * `fts` column in supabase/008_archive.sql, including why labels are not in it.
 */
/** PostgREST's answer when the function is not in the schema cache yet. */
function isMissingFunction(message: string): boolean {
  return /Could not find the function|schema cache|does not exist/i.test(message)
}

export function useArchiveSearch(term: string, limit = 25) {
  const query = term.trim()
  // Two characters is where the index stops being useful and starts returning
  // most of the archive.
  const enabled = query.length >= 2
  const [result, setResult] = useState<{ query: string; hits: ArchiveSummary[] }>(
    { query: '', hits: [] },
  )

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    // Debounced: this one leaves the browser, unlike the blog's search, so it
    // waits for a pause in typing rather than firing on every keystroke.
    const id = setTimeout(async () => {
      // ⚠ AN RPC, NOT A SELECT, AND THE REASON IS THE SNIPPET. The stored
      // `excerpt` is a fixed opening extract, so a hit deep in a long post
      // showed the reader its first paragraph with nothing marked in it —
      // searching for "Murphy" returned a GERS post whose only mention was
      // 21,911 characters in. `search_archive` returns a ts_headline cut around
      // the match instead, marked by the same tsquery that found it, so
      // stemming highlights correctly. See supabase/011_archive_search.sql.
      const { data, error } = await supabase.rpc('search_archive', { q: query, lim: limit })
      if (cancelled) return

      // ⚠ FALLS BACK TO THE PLAIN SELECT, and this is not belt-and-braces: on
      // the deploy that lands before the migration is run, the function does not
      // exist and every search would return nothing at all. Search going quiet
      // is a much worse failure than search showing the old, blunter excerpt.
      if (error && isMissingFunction(error.message)) {
        const legacy = await supabase
          .from('archive_posts')
          .select(LIST_COLUMNS)
          .textSearch('fts', query, { type: 'websearch' })
          .order('published_at', { ascending: false })
          .limit(limit)
        if (cancelled) return
        setResult({ query, hits: legacy.error ? [] : ((legacy.data ?? []) as ArchiveSummary[]) })
        return
      }

      // A malformed query (a lone quote, mid-typing) comes back as a 400 from
      // Postgres rather than an outage: show nothing and wait for the next
      // keystroke. Recorded against this query either way, so it settles.
      setResult({ query, hits: error ? [] : ((data ?? []) as ArchiveSummary[]) })
    }, 250)
    return () => { cancelled = true; clearTimeout(id) }
  }, [query, enabled, limit])

  const settled = result.query === query
  return { hits: enabled && settled ? result.hits : [], searching: enabled && !settled }
}

/** Save an edit from Admin. Returns null on success, or a message to show. */
export function useArchiveEdit() {
  return useCallback(async (
    path: string,
    fields: Partial<Pick<ArchivePost, 'note' | 'title' | 'html'>>,
  ): Promise<string | null> => {
    const { error } = await supabase.from('archive_posts').update(fields).eq('path', path)
    if (!error) return null
    if (/row-level security/i.test(error.message)) {
      return 'That save was refused. Your session may have expired — reload and sign in again.'
    }
    return error.message
  }, [])
}
