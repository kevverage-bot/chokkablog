import { isPlausibleEmail } from './feedback'

/**
 * Shape and validation for a reader's comment.
 *
 * As with feedback, the browser validates for a fast friendly error and the Edge
 * Function validates again because this copy is advisory. The limits are
 * duplicated in supabase/functions/submit-comment/index.ts and pinned to it by
 * src/__tests__/publicWrite.test.ts.
 */
export const COMMENT_LIMITS = {
  body: 2000,
  name: 80,
  email: 200,
} as const

export interface CommentDraft {
  body: string
  name: string
  email: string
}

/**
 * An error string for the reader, or null when the draft is sendable.
 *
 * Both the name and the email are required here, unlike feedback: a comment is
 * published under a name, and a real address is what that costs — it is never
 * shown, and is only used to reach the person who wrote it.
 */
export function validateComment(draft: CommentDraft): string | null {
  const body = draft.body.trim()
  if (!body) return 'Please write a comment first.'
  if (body.length > COMMENT_LIMITS.body) {
    return `Comments are limited to ${COMMENT_LIMITS.body.toLocaleString()} characters.`
  }

  const name = draft.name.trim()
  if (!name) return 'Please add your name.'
  if (name.length > COMMENT_LIMITS.name) return 'That name is too long.'

  const email = draft.email.trim()
  if (!email) return 'Please add your email address.'
  if (email.length > COMMENT_LIMITS.email) return 'That email address is too long.'
  if (!isPlausibleEmail(email)) return 'That email address does not look right.'

  return null
}
