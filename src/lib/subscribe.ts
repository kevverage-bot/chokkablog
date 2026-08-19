/**
 * Shape, validation, and the handover to Kit for a new-post sign-up.
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
 * Kit's form-submission endpoint — the one its own embed script posts to.
 *
 * ⚠ THIS IS CALLED FROM THE READER'S BROWSER, AND IT HAS TO BE. Three routes
 * were tried against the live account on 19 Aug 2026:
 *
 *   1. Kit's documented API, POST /v4/subscribers — adds the address in state
 *      `active` and sends NOTHING. Double opt-in bypassed entirely.
 *   2. This URL, called from the Supabase Edge Function — HTTP 200 with
 *      `"status":"quarantined"` and a guard URL. Kit's anti-abuse refusing a
 *      submission from a datacentre IP with no browser behind it.
 *   3. This URL, from a real browser — `"status":"success"`, held unconfirmed,
 *      confirmation email sent. The only route that produces consent worth
 *      having.
 *
 * So the fetch below runs client-side on purpose, and moving it "properly" onto
 * the server would silently quarantine every sign-up. Kit answers the preflight
 * with `access-control-allow-origin: *`, which is what makes that possible.
 *
 * 9820264 is "Chokkablog Sign Up". Public — it is in the embed code of any site
 * that uses one — so it lives here rather than in a secret.
 */
export const KIT_FORM_ID = '9820264'
export const KIT_FORM_URL = `https://app.kit.com/forms/${KIT_FORM_ID}/subscriptions`

/** Kit is a third party on the far side of the internet. Without this, a slow
 *  response leaves the reader watching a spinner with no way out. */
const KIT_TIMEOUT_MS = 10_000

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

/**
 * Hand the address to Kit, which sends the confirmation email.
 *
 * ⚠ CALL THIS ONLY AFTER THE EDGE FUNCTION HAS RETURNED. The consent record has
 * to be committed before the handover, so a Kit outage costs a notification and
 * never the evidence that somebody asked.
 *
 * ⚠ AND KIT ANSWERS 200 WHEN IT HAS REFUSED. `status` carries the real outcome:
 * 'success', or 'quarantined' when its guard has held the submission back. A
 * bare `res.ok` would report a quarantined address as a completed sign-up, and
 * the reader would sit waiting for an email that is never sent.
 */
export async function handOverToKit(email: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(KIT_FORM_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ email_address: email.trim().toLowerCase() }),
      signal: AbortSignal.timeout(KIT_TIMEOUT_MS),
    })
    const payload = await res.json().catch(() => null)
    if (res.ok && payload?.status === 'success') return { ok: true }

    // Quarantined, or anything else Kit chose to say. Distinguished in the
    // console only — a reader cannot act on the difference, and telling them
    // which anti-abuse rule they tripped helps nobody but somebody testing it.
    console.warn('Kit did not accept the sign-up:', res.status, payload)
    return { ok: false, error: 'Could not complete that sign-up — please try again in a moment.' }
  } catch (e) {
    // A blocked request looks like this too: an extension or a network that
    // refuses kit.com throws rather than answering.
    console.warn('Kit could not be reached:', e)
    return { ok: false, error: 'Could not reach the mailing list just now — please try again in a moment.' }
  }
}
