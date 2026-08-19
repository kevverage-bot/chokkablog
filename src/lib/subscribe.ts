/**
 * Shape and validation for a new-post sign-up.
 *
 * Same contract as src/lib/feedback.ts: the browser validates so the reader gets
 * an instant, friendly error; the Edge Function validates again because the
 * browser's copy is ADVISORY ONLY — anyone can POST at the function directly.
 * The number below is duplicated in supabase/functions/subscribe/index.ts, which
 * is deployed alone to Deno and cannot import from src/. Change one, change the
 * other; src/__tests__/publicWrite.test.ts reads that file and fails if they
 * differ.
 *
 * ⚠ ONE FIELD, DELIBERATELY. No name, no "what are you interested in". Every
 * extra box costs sign-ups, Kit needs only the address, and a name collected
 * here would be a second piece of personal data held for no purpose anyone could
 * name — which is the opposite of what the consent record is meant to look like.
 */

export const SUBSCRIBE_LIMITS = {
  email: 200,
  /** Below this, a "human" typed an address into a one-field form in under two
   *  seconds. Mirrors MIN_ELAPSED_MS in supabase/functions/_shared/guard.ts. */
  minElapsedMs: 2000,
} as const

/**
 * An error string for the reader, or null when the address is sendable.
 *
 * Unlike feedback, the address is the entire point, so it is required here.
 */
export function validateSubscribe(email: string): string | null {
  const trimmed = email.trim()
  if (!trimmed) return 'Please enter your email address.'
  if (trimmed.length > SUBSCRIBE_LIMITS.email) return 'That email address is too long.'
  if (!isPlausibleEmail(trimmed)) return 'That email address does not look right.'
  return null
}

/**
 * A shape check, not a validity check: something@something.tld with no spaces.
 *
 * Deliberately loose, and the same expression src/lib/feedback.ts uses. The cost
 * of rejecting a real address is far higher than the cost of accepting a fake
 * one — which here simply never confirms, and so never joins the list at all.
 * That is what the double opt-in is for; this box is not the place to be clever
 * about it.
 */
export function isPlausibleEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}
