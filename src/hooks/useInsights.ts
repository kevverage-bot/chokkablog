import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

/** One post. Mirrors public.insights — see supabase/003_insights.sql. */
export interface Insight {
  id: string
  /** This post's URL segment (/insights/<slug>). Null only on a draft that has
   *  not been given an address yet; the database refuses to publish without one.
   *  ⚠ Frozen once public — changing it breaks every existing link. */
  slug: string | null
  headline: string
  /** Compact label for the tab and search results, where a long headline is cut.
   *  Empty falls back to the headline. */
  short_title: string
  /** Hub excerpt and meta description. Blank falls back to an auto-excerpt of
   *  the body — see lib/insightExcerpt. */
  summary: string
  /** The post, as Markdown in the subset RichText renders. */
  body: string
  /** Small print below the post: sources, caveats, corrections. */
  footer: string
  /** Draft/live gate. Unpublished rows are returned by RLS to admins only. */
  published: boolean
  /** When it first went live. Stamped by the database, never the client. Null
   *  while a draft. */
  published_at: string | null
  created_at: string
  updated_at: string
}

export type InsightDraft = Pick<
  Insight,
  'slug' | 'headline' | 'short_title' | 'summary' | 'body' | 'footer' | 'published'
> & {
  /** Set only to backdate a post; leave undefined and the database stamps it. */
  published_at?: string | null
}

/** Newest first. Drafts have no published_at and sort to the top, where the
 *  author is working — the ordering the admin list wants, and the hub only ever
 *  sees published rows anyway. */
const ORDER = { column: 'published_at', ascending: false, nullsFirst: true } as const

/** The one query the site makes for posts. Shared by the initial load and by
 *  the refresh after a mutation, so the two can never drift apart in ordering. */
async function fetchInsights() {
  return supabase
    .from('insights')
    .select('*')
    .order(ORDER.column, { ascending: ORDER.ascending, nullsFirst: ORDER.nullsFirst })
    .order('created_at', { ascending: false })
}

/**
 * The posts, and the admin operations on them.
 *
 * Reads are unauthenticated and RLS decides what comes back: published rows for
 * everyone, plus drafts for an admin. So the same call serves the public hub and
 * the admin list, and there is no filtering here that could disagree with the
 * database about what is public.
 */
export function useInsights() {
  const [insights, setInsights] = useState<Insight[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Guarded by `cancelled` so a component unmounted mid-flight does not set
  // state afterwards, and declared inside the effect rather than as a callback
  // the effect calls, so the first load has a cleanup to attach to.
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const { data, error } = await fetchInsights()
      if (cancelled) return
      if (error) {
        console.error('Failed to load insights:', error.message)
        setError(error.message)
      } else {
        setError(null)
        setInsights((data ?? []) as Insight[])
      }
      setLoading(false)
    }
    void load()
    return () => { cancelled = true }
  }, [])

  /** Re-read after a write. Unguarded on purpose: it only runs in response to a
   *  save the author just made, so the component is on screen by definition. */
  const refresh = useCallback(async () => {
    const { data, error } = await fetchInsights()
    if (error) {
      console.error('Failed to load insights:', error.message)
      setError(error.message)
    } else {
      setError(null)
      setInsights((data ?? []) as Insight[])
    }
    setLoading(false)
  }, [])

  /** Each mutation returns null on success, or a message to show the author.
   *  The editor keeps their text on screen when one fails, so the message has to
   *  come back rather than only reaching the console. */
  const create = useCallback(async (draft: InsightDraft): Promise<string | null> => {
    const { error } = await supabase.from('insights').insert(draft)
    if (error) return friendly(error.message)
    await refresh()
    return null
  }, [refresh])

  const update = useCallback(async (id: string, draft: InsightDraft): Promise<string | null> => {
    const { error } = await supabase.from('insights').update(draft).eq('id', id)
    if (error) return friendly(error.message)
    await refresh()
    return null
  }, [refresh])

  const remove = useCallback(async (id: string): Promise<string | null> => {
    const { error } = await supabase.from('insights').delete().eq('id', id)
    if (error) return friendly(error.message)
    await refresh()
    return null
  }, [refresh])

  return { insights, loading, error, refresh, create, update, remove }
}

/**
 * Turn a Postgres error into something an author can act on.
 *
 * The two that actually happen are the slug unique index and the
 * published-needs-slug check, and both arrive as constraint names — accurate,
 * and no help at all when what you want to know is which box to fix.
 */
function friendly(message: string): string {
  if (message.includes('insights_slug_key')) {
    return 'Another post already uses that URL slug.'
  }
  if (message.includes('insights_published_needs_slug')) {
    return 'A published post needs a URL slug — it has no address without one.'
  }
  if (/row-level security/i.test(message)) {
    return 'That save was refused. Your session may have expired — reload and sign in again.'
  }
  return message
}
