/**
 * Shape and validation for reader feedback.
 *
 * The browser validates so the reader gets an instant, friendly error; the Edge
 * Function validates again because the browser's copy is ADVISORY ONLY — anyone
 * can POST at the function directly, and a limit enforced only here is not a
 * limit. The numbers below are duplicated in
 * supabase/functions/submit-feedback/index.ts, which is deployed alone to Deno
 * and cannot import from src/. Change one, change the other;
 * src/__tests__/publicWrite.test.ts reads that file and fails if they differ.
 */

export const FEEDBACK_LIMITS = {
  message: 4000,
  name: 120,
  email: 200,
  /** Below this, a "human" filled in a 4,000-character form in under two
   *  seconds. Mirrors MIN_ELAPSED_MS in supabase/functions/_shared/guard.ts. */
  minElapsedMs: 2000,
} as const

export interface FeedbackDraft {
  message: string
  name: string
  email: string
}

/**
 * An error string for the reader, or null when the draft is sendable.
 *
 * Email is optional — plenty of people want to point out a wrong number without
 * starting a correspondence — but if given it has to be plausible, or a reply
 * silently goes nowhere.
 */
export function validateFeedback(draft: FeedbackDraft): string | null {
  const message = draft.message.trim()
  if (!message) return 'Please write a message first.'
  if (message.length > FEEDBACK_LIMITS.message) {
    return `That is longer than the ${FEEDBACK_LIMITS.message.toLocaleString()} characters this form takes.`
  }
  if (draft.name.trim().length > FEEDBACK_LIMITS.name) return 'That name is too long.'

  const email = draft.email.trim()
  if (email) {
    if (email.length > FEEDBACK_LIMITS.email) return 'That email address is too long.'
    if (!isPlausibleEmail(email)) return 'That email address does not look right.'
  }
  return null
}

/**
 * A shape check, not a validity check: something@something.tld with no spaces.
 *
 * Deliberately loose. The cost of rejecting a real address is far higher than
 * the cost of accepting a fake one, which simply never gets a reply.
 */
export function isPlausibleEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}
