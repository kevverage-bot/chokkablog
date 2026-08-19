// Supabase Edge Function: subscribe
//
// The public write path for new-post sign-ups. It records the CONSENT, and
// nothing else: the browser hands the address to Kit itself, immediately after
// this returns. See src/lib/subscribe.ts for that half.
//
// ⚠ WHY THIS FUNCTION DOES NOT TALK TO KIT, having originally been written to.
// Kit's form endpoint expects a reader's browser. Called from here it answers
// HTTP 200 with `"status":"quarantined"` and a guard URL — its anti-abuse system
// refusing a submission from a datacentre IP with no browser behind it. Verified
// against the live form on 19 Aug 2026: the identical POST succeeds from a
// residential connection and is quarantined from the Edge Function. Browser-like
// headers do not fix it; the IP is the part Kit objects to, and no header can
// change that.
//
// So the order is: this function guards and records, then the BROWSER posts to
// Kit from the reader's own address, which is the request Kit is built to
// accept. The consent record is still written first — a Kit failure costs a
// notification, never the evidence that somebody asked.
//
// It exists for the same reason as submit-feedback: RLS cannot enforce a captcha.
// The anon key ships in the JS bundle, so an anon INSERT policy on `subscribers`
// would let anyone POST straight at the REST endpoint. See supabase/009_subscribers.sql.
//
// Deploy:   supabase functions deploy subscribe
// Secrets:  HCAPTCHA_SECRET (shared with the other two — already set).
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

    // ⚠ THE CONSENT ROW IS WRITTEN BEFORE THE BROWSER IS TOLD TO GO TO KIT, and
    // the caller awaits this. The record is the thing we are obliged to be able
    // to produce; the handover is the thing that can be retried.
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
