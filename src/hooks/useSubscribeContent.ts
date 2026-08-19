import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

/** The editable words on the sign-up box. Mirrors the single row of
 *  public.subscribe_content — see supabase/010_subscribe.sql. */
export interface SubscribeContent {
  /** The label above the pitch. Blank hides it. */
  heading: string
  /** The pitch, as Markdown in the subset RichText renders. */
  intro: string
  /** The submit button's label. */
  button: string
  /** The line beside the comment form's opt-in checkbox. */
  comment_optin: string
}

const COLUMNS = 'heading, intro, button, comment_optin'

/**
 * The sign-up box's text, and the one operation on it.
 *
 * Exactly one row, enforced by the database, so this reads with `maybeSingle`
 * and updates without a filter — the same shape as useHomeContent, and for the
 * same reasons.
 *
 * ⚠ THIS NEVER GATES THE FORM. A failed read falls back to the wording in
 * src/constants/subscribe.ts and the box renders anyway: the words are an
 * improvement on the box, not a precondition for it, and a database hiccup must
 * not cost a sign-up. That is why there is no `failed` flag in what this
 * returns for the reader's side — the fallback is applied here.
 */
export function useSubscribeContent() {
  const [content, setContent] = useState<SubscribeContent | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  const read = useCallback(async () => {
    const { data, error } = await supabase
      .from('subscribe_content')
      .select(COLUMNS)
      .maybeSingle()
    if (error) {
      console.error('Failed to load the sign-up wording:', error.message)
      return { content: null, failed: true }
    }
    // No error and no row means the seed never ran: treat it as a failure so
    // the box shows the bundled wording rather than an unlabelled field.
    return { content: (data as SubscribeContent | null), failed: data === null }
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
  const save = useCallback(async (next: SubscribeContent): Promise<string | null> => {
    const { error } = await supabase.from('subscribe_content').update(next).eq('id', true)
    if (error) return friendlySubscribeError(error.message)
    const r = await read()
    setContent(r.content)
    setFailed(r.failed)
    return null
  }, [read])

  return { content, loading, failed, save }
}

/** Turn a Postgres error into something an author can act on. */
export function friendlySubscribeError(message: string): string {
  if (/row-level security/i.test(message)) {
    return 'That save was refused. Your session may have expired — reload and sign in again.'
  }
  if (/relation .* does not exist|schema cache/i.test(message)) {
    return 'The sign-up wording is not in the database yet — run supabase/010_subscribe.sql.'
  }
  return message
}
