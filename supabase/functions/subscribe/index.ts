// Supabase Edge Function: subscribe
//
// The public write path for new-post sign-ups: the box at the foot of a post →
// this → the `subscribers` table (the consent record) → Kit (the list).
//
// ⚠ WHY IT POSTS AT A FORM URL AND NOT AT KIT'S API. Kit's documented v4 route,
// POST /v4/subscribers, adds people in state `active` and sends NOTHING — it
// bypasses double opt-in entirely. Verified against the live account on
// 19 Aug 2026: an address added that way was on the list immediately and got no
// email. Posting at the form's own submission endpoint — the one Kit's embed
// script uses — behaves like a real sign-up: the address is held unconfirmed and
// Kit sends the confirmation email configured on the form.
//
// Two consequences worth keeping:
//   1. NO API KEY. This endpoint is unauthenticated, so there is no Kit
//      credential in Supabase to leak, rotate or forget. Do not "improve" this by
//      moving to the authenticated API — it would cost the double opt-in, which
//      is the entire consent mechanism.
//   2. The form's settings own the behaviour. Confirmation email on, auto-confirm
//      off, in Kit → the form → Settings → Confirmation Email. Turning
//      auto-confirm on there would silently make every sign-up single opt-in,
//      with no change in this repo to show for it.
//
// It exists for the same reason as submit-feedback: RLS cannot enforce a captcha.
// The anon key ships in the JS bundle, so an anon INSERT policy on `subscribers`
// would let anyone POST straight at the REST endpoint. See supabase/009_subscribers.sql.
//
// Deploy:   supabase functions deploy subscribe
// Secrets:  HCAPTCHA_SECRET (shared with the other two — already set).
//           Optional: KIT_FORM_ID (defaults to the live form below).
//
// deno-lint-ignore-file no-explicit-any
import { adminClient, cors, guard, json, EMAIL_RE } from '../_shared/guard.ts'

// Mirrors SUBSCRIBE_LIMITS in src/lib/subscribe.ts. Duplicated because this file
// is deployed alone to Deno and cannot import from src/ — a test pins the pair
// together by reading this source.
const LIMITS = {
  email: 200,
}

// Lower than feedback's: one person has no reason to sign up five times an hour,
// and this is the endpoint where a flood costs Kit's sending reputation rather
// than just an inbox.
const RATE_LIMIT = { perSenderPerHour: 3, sitePerHour: 30 }

/** "Chokkablog Sign Up". Not a secret — it is in the embed code on any site that
 *  uses one — but an env var so it can be repointed without a deploy. */
const FORM_ID = Deno.env.get('KIT_FORM_ID') ?? '9820264'

/** Kit is a third party on the far side of the internet. Without this, one slow
 *  response holds a reader's browser open until the platform's own timeout. */
const KIT_TIMEOUT_MS = 10_000

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const body = await req.json().catch(() => ({}))
    const admin = adminClient()

    // Honeypot → time-on-form → captcha → rate limit, shared with the other two.
    const g = await guard(req, body, admin, { table: 'subscribers', ...RATE_LIMIT })
    if (g.blocked) return g.blocked

    // Shape. Lowercased to match the check constraint on the column, which is
    // what makes one person one row however they typed it.
    const email = String(body.email ?? '').trim().toLowerCase().slice(0, LIMITS.email)
    if (!email) return json({ error: 'Please enter your email address.' }, 400)
    if (!EMAIL_RE.test(email)) {
      return json({ error: 'That email address does not look right.' }, 400)
    }

    const viewUrl = String(body.viewUrl ?? '').slice(0, 2000)
    let sourcePage: string | null = null
    try { sourcePage = viewUrl ? new URL(viewUrl).pathname : null } catch { sourcePage = null }

    // ⚠ OUR ROW FIRST, KIT SECOND. The consent record is the thing we are
    // obliged to be able to produce; the handover is the thing we can retry. If
    // this order is reversed, a Kit outage loses the evidence that somebody
    // asked, which is the one thing this table exists for.
    //
    // Upsert, because a repeat sign-up is not an error — see the constraint note
    // in 009_subscribers.sql. `status` is deliberately NOT overwritten on
    // conflict: someone already 'confirmed' must not be demoted to 'pending'
    // just for filling the box in again.
    const { error: upsertErr } = await admin
      .from('subscribers')
      .upsert({
        email,
        source: 'site',
        source_page: sourcePage,
        view_url: viewUrl || null,
        user_agent: (req.headers.get('user-agent') ?? '').slice(0, 500) || null,
        ip_hash: g.ipHash,
      }, { onConflict: 'email', ignoreDuplicates: false })
    if (upsertErr) {
      console.error('Failed to record a sign-up:', upsertErr.message)
      return json({ error: 'Could not sign you up — please try again.' }, 500)
    }

    // Hand over to Kit. This is what sends the confirmation email; until the
    // reader clicks the link in it, they are not on the list.
    let kitOk = false
    let kitError = ''
    try {
      const res = await fetch(`https://app.kit.com/forms/${FORM_ID}/subscriptions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ email_address: email }),
        signal: AbortSignal.timeout(KIT_TIMEOUT_MS),
      })
      const payload = await res.json().catch(() => ({}))
      kitOk = res.ok && payload?.status === 'success'
      if (!kitOk) kitError = `Kit ${res.status}: ${JSON.stringify(payload).slice(0, 300)}`
    } catch (e) {
      kitError = e instanceof Error ? e.message : 'Kit request failed'
    }

    if (!kitOk) {
      // The consent stands and the row is kept — flagged, so it can be chased by
      // hand rather than silently lost. The reader is told the truth: nothing
      // will arrive, so "check your inbox" would be a lie that costs them the
      // sign-up.
      console.error('Kit handover failed:', kitError)
      await admin
        .from('subscribers')
        .update({ status: 'failed', kit_error: kitError.slice(0, 500) })
        .eq('email', email)
      return json({ error: 'Something went wrong at our end — please try again in a moment.' }, 502)
    }

    // ⚠ ONE ANSWER, WHETHER OR NOT THIS ADDRESS WAS ALREADY KNOWN. Anyone can
    // POST here with anyone else's address, so a reply that distinguished a new
    // sign-up from an existing one would turn this endpoint into an oracle for
    // testing whether a given person reads chokkablog. Do not add a flag for the
    // form to render a warmer message with — that is the same leak with nicer
    // wording.
    return json({ ok: true })
  } catch (e) {
    console.error(e)
    return json({ error: e instanceof Error ? e.message : 'Unexpected error' }, 500)
  }
})
