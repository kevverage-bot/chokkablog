import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

/** The editable words on the home page. Mirrors the single row of
 *  public.home_content — see supabase/005_home.sql. */
export interface HomeContent {
  /** The chip above the intro. Blank hides it. */
  badge: string
  /** The standfirst, as Markdown in the subset RichText renders. */
  intro: string
  /** The label over the tools grid. */
  tools_heading: string
}

const COLUMNS = 'badge, intro, tools_heading'

/**
 * The home page's text, and the one operation on it.
 *
 * There is exactly one row and the database enforces that (a boolean primary
 * key with `check (id)`), so this reads with `maybeSingle` and updates without
 * a filter — there is nothing to match on and nothing else it could hit.
 *
 * `failed` is separate from `content === null` on purpose. A read that errored
 * because the migration has not been run yet must fall back to the wording in
 * the bundle; a row that is simply blank must render blank, because someone
 * chose that in Admin.
 */
export function useHomeContent() {
  const [content, setContent] = useState<HomeContent | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  const read = useCallback(async () => {
    const { data, error } = await supabase
      .from('home_content')
      .select(COLUMNS)
      .maybeSingle()
    if (error) {
      console.error('Failed to load home content:', error.message)
      return { content: null, failed: true }
    }
    // No error and no row means the seed never ran: treat it as a failure so
    // the page shows something rather than an empty shell.
    return { content: (data as HomeContent | null), failed: data === null }
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const r = await read()
      if (cancelled) return
      setContent(r.content)
      setFailed(r.failed)
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [read])

  /** Null on success, or a message to show the author. The editor keeps their
   *  text on screen when a save fails, so the message has to come back rather
   *  than only reaching the console. */
  const save = useCallback(async (next: HomeContent): Promise<string | null> => {
    // `id` is a boolean that the table's check constraint pins to true, so this
    // filter is the whole table and needs no id read back from anywhere.
    const { error } = await supabase.from('home_content').update(next).eq('id', true)
    if (error) return friendlyHomeError(error.message)
    const r = await read()
    setContent(r.content)
    setFailed(r.failed)
    return null
  }, [read])

  return { content, loading, failed, save }
}

/** Turn a Postgres error into something an author can act on. */
export function friendlyHomeError(message: string): string {
  if (/row-level security/i.test(message)) {
    return 'That save was refused. Your session may have expired — reload and sign in again.'
  }
  if (/relation .* does not exist|schema cache/i.test(message)) {
    return 'The home page tables are not in the database yet — run supabase/005_home.sql.'
  }
  return message
}
