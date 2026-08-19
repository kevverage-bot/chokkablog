import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { readFunctionError } from '../lib/functionError'
import { handOverToKit } from '../lib/subscribe'

/** A comment as the public sees it. No email — the view does not select it. */
export interface PublicComment {
  id: string
  post_id: string
  /** Set when this is a reply to another comment. */
  parent_id: string | null
  /** The author answering, rendered with a badge rather than as a peer. */
  is_author: boolean
  author_name: string
  body: string
  created_at: string
  approved_at: string | null
}

/** A top-level comment with the replies hanging off it. */
export interface CommentThread extends PublicComment {
  replies: PublicComment[]
}

/**
 * Nest replies under their parents, preserving order within each level.
 *
 * A reply whose parent is not in the list is DROPPED rather than promoted to the
 * top: its parent has been unapproved, and an answer floating free of the thing
 * it answers reads as a non-sequitur — or worse, as agreement with something
 * nobody can see.
 */
export function threadComments(comments: PublicComment[]): CommentThread[] {
  const threads = new Map<string, CommentThread>()
  for (const c of comments) {
    if (!c.parent_id) threads.set(c.id, { ...c, replies: [] })
  }
  for (const c of comments) {
    if (c.parent_id) threads.get(c.parent_id)?.replies.push(c)
  }
  return [...threads.values()]
}

export interface CommentSubmission {
  postId: string
  body: string
  name: string
  email: string
  token: string | null
  elapsedMs: number
  website: string
  /** The opt-in box beside the form, unticked by default. An address given so a
   *  comment can be answered is NOT consent to a mailing list — this is the
   *  separate, explicit act that makes it one. */
  subscribe?: boolean
}

/**
 * Approved comments for one post, plus the submit path.
 *
 * Reads `comments_public`, NEVER the table: that view selects only approved rows
 * and drops the email column, so there is no query a reader can write — however
 * they mangle the URL — that returns an unapproved comment or anybody's address.
 * See supabase/007_comments.sql.
 */
export function useComments(postId: string | null) {
  const [comments, setComments] = useState<PublicComment[]>([])
  const [loading, setLoading] = useState(true)

  const read = useCallback(async () => {
    if (!postId) { setComments([]); setLoading(false); return }
    const { data, error } = await supabase
      .from('comments_public')
      .select('*')
      .eq('post_id', postId)
      // Oldest first: a thread reads as a conversation, not a news feed.
      .order('created_at', { ascending: true })
    if (error) console.error('Failed to load comments:', error.message)
    else setComments((data as PublicComment[]) ?? [])
    setLoading(false)
  }, [postId])

  // `read` is re-created when postId changes, so this re-runs and puts the list
  // back into loading for the new post rather than showing the old post's
  // comments under the new one's headline.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (cancelled) return
      setLoading(true)
      await read()
    })()
    return () => { cancelled = true }
  }, [read])

  const submit = useCallback(async (
    sub: CommentSubmission,
  ): Promise<{ ok: boolean; error?: string; subscribeFailed?: boolean }> => {
    const { data, error } = await supabase.functions.invoke('submit-comment', {
      body: {
        postId: sub.postId,
        body: sub.body.trim(),
        name: sub.name.trim(),
        email: sub.email.trim(),
        token: sub.token,
        elapsedMs: sub.elapsedMs,
        website: sub.website,
        subscribe: sub.subscribe === true,
        viewUrl: typeof window === 'undefined' ? '' : window.location.href,
      },
    })
    if (error) return { ok: false, error: await readFunctionError(error, 'Could not post that.') }
    if (data && data.ok === false) return { ok: false, error: data.error ?? 'Could not post that.' }

    // The consent row was written under the captcha this request already spent;
    // Kit will only take the handover from a browser, so it happens here. ⚠ A
    // failure is reported but never turns the comment into a failure — the words
    // are what the reader came to give, and they are safely stored.
    let subscribeFailed = false
    if (data?.subscribed === true) {
      const kit = await handOverToKit(sub.email)
      subscribeFailed = !kit.ok
    }
    // Deliberately no refetch: the comment is pending, so it would not come back,
    // and a list that silently did not change reads as a failure.
    return { ok: true, subscribeFailed }
  }, [])

  return { comments, loading, refresh: read, submit }
}
