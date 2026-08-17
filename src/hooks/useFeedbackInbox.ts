import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export type FeedbackStatus = 'new' | 'read' | 'actioned' | 'spam'

/** One message, as the inbox sees it — including the sender's address, which is
 *  admin-only and never leaves this page. */
export interface FeedbackItem {
  id: string
  created_at: string
  message: string
  name: string | null
  email: string | null
  page: string | null
  view_url: string | null
  user_agent: string | null
  status: FeedbackStatus
  admin_note: string | null
  handled_at: string | null
}

/**
 * The feedback inbox.
 *
 * Reads the table directly, which only works for an admin: `feedback` has no
 * select policy for anyone else, and no insert policy for ANYONE — messages
 * arrive through the submit-feedback Edge Function. See supabase/006_feedback.sql.
 */
export function useFeedbackInbox() {
  const [items, setItems] = useState<FeedbackItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const read = useCallback(async () => {
    const { data, error } = await supabase
      .from('feedback')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) {
      console.error('Failed to load feedback:', error.message)
      setError(error.message)
    } else {
      setError(null)
      setItems((data ?? []) as FeedbackItem[])
    }
    setLoading(false)
  }, [])

  // The loader is declared inside the effect (rather than the effect calling
  // `read` directly) so the first load has a cleanup to attach to: a component
  // unmounted mid-flight must not set state afterwards. Same shape as usePosts.
  useEffect(() => {
    let cancelled = false
    void (async () => { if (!cancelled) await read() })()
    return () => { cancelled = true }
  }, [read])

  /** Triage. `handled_at` is stamped on the way out of 'new' and cleared on the
   *  way back, so "when did I deal with this" survives a change of mind. */
  const setStatus = useCallback(async (id: string, status: FeedbackStatus): Promise<string | null> => {
    const { error } = await supabase
      .from('feedback')
      .update({ status, handled_at: status === 'new' ? null : new Date().toISOString() })
      .eq('id', id)
    if (error) return error.message
    await read()
    return null
  }, [read])

  const setNote = useCallback(async (id: string, note: string): Promise<string | null> => {
    const { error } = await supabase
      .from('feedback')
      .update({ admin_note: note.trim() || null })
      .eq('id', id)
    if (error) return error.message
    await read()
    return null
  }, [read])

  const remove = useCallback(async (id: string): Promise<string | null> => {
    const { error } = await supabase.from('feedback').delete().eq('id', id)
    if (error) return error.message
    await read()
    return null
  }, [read])

  /** What the section header counts. Unread is the only number worth a badge. */
  const newCount = items.filter((i) => i.status === 'new').length

  return { items, loading, error, newCount, refresh: read, setStatus, setNote, remove }
}
