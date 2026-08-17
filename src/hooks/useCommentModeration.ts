import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export type CommentStatus = 'pending' | 'approved' | 'rejected' | 'spam'

/** One comment as the moderation queue sees it: every column, including the
 *  address the public view drops, plus which post it is on. */
export interface ModeratedComment {
  id: string
  post_id: string
  parent_id: string | null
  is_author: boolean
  created_at: string
  author_name: string
  body: string
  email: string | null
  status: CommentStatus
  approved_at: string | null
  admin_note: string | null
  view_url: string | null
  /** Joined from the posts table, for "which page was this on". */
  post: { headline: string; slug: string | null } | null
}

/** `insights` is the posts table — see the note at the top of usePosts.ts. The
 *  alias is what makes the join read as `post` on this side. */
const SELECT = '*, post:insights(headline, slug)'

/**
 * The comment moderation queue.
 *
 * Reads the base table, which only an admin can do, and which is the only way to
 * see a pending comment or a sender's address — the public reads a view that has
 * neither. See supabase/007_comments.sql.
 */
export function useCommentModeration() {
  const [comments, setComments] = useState<ModeratedComment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const read = useCallback(async () => {
    const { data, error } = await supabase
      .from('comments')
      .select(SELECT)
      .order('created_at', { ascending: false })
    if (error) {
      console.error('Failed to load comments:', error.message)
      setError(error.message)
    } else {
      setError(null)
      setComments((data ?? []) as unknown as ModeratedComment[])
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

  /** Approve, reject, or mark as spam. `approved_at` is stamped the first time a
   *  comment goes live and then left alone, so pulling one back to fix a typo in
   *  the reply beneath it does not re-date it. */
  const setStatus = useCallback(async (
    id: string,
    status: CommentStatus,
    approvedAt: string | null,
  ): Promise<string | null> => {
    const patch: Record<string, unknown> = { status }
    if (status === 'approved' && !approvedAt) patch.approved_at = new Date().toISOString()
    const { error } = await supabase.from('comments').update(patch).eq('id', id)
    if (error) return error.message
    await read()
    return null
  }, [read])

  const remove = useCallback(async (id: string): Promise<string | null> => {
    // The FK cascades, so deleting a comment takes any reply to it with it —
    // which is right: a reply to a deleted comment answers nothing.
    const { error } = await supabase.from('comments').delete().eq('id', id)
    if (error) return error.message
    await read()
    return null
  }, [read])

  /**
   * Answer a comment in public, as the author.
   *
   * Inserted straight into the table (the one insert policy on it is admin-only)
   * and approved on arrival: an author moderating their own reply is a queue of
   * one. `is_author` is what earns the badge on the page.
   */
  const reply = useCallback(async (parent: ModeratedComment, body: string, authorName: string): Promise<string | null> => {
    const text = body.trim()
    if (!text) return 'Write a reply first.'
    const { error } = await supabase.from('comments').insert({
      post_id: parent.post_id,
      parent_id: parent.id,
      author_name: authorName,
      body: text,
      is_author: true,
      status: 'approved',
      approved_at: new Date().toISOString(),
    })
    if (error) return error.message
    await read()
    return null
  }, [read])

  /** Only a pending comment is somebody waiting, which is what the badge means. */
  const pendingCount = comments.filter((c) => c.status === 'pending').length

  return { comments, loading, error, pendingCount, refresh: read, setStatus, remove, reply }
}
