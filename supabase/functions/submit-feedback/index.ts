// Supabase Edge Function: submit-feedback
//
// The public write path for reader feedback: the footer form → this → the
// `feedback` table → an email to the site owner.
//
// It exists because RLS cannot enforce a captcha. The anon key ships in the JS
// bundle, so an anon INSERT policy on `feedback` would let anyone POST straight
// at the REST endpoint and never load the form. So there is no anon policy at
// all, and this verifies the captcha server-side before inserting with the
// service-role key. See supabase/006_feedback.sql.
//
// Called unauthenticated. The platform's verify_jwt is satisfied by the anon key
// supabase-js attaches to every invoke, so no config change is needed — that
// check only proves the request came from a Supabase client. The real gate is the
// captcha in _shared/guard.ts.
//
// Deploy:   supabase functions deploy submit-feedback
// Secrets:  supabase secrets set HCAPTCHA_SECRET=ES_... \
//                                RESEND_API_KEY=re_... \
//                                FEEDBACK_TO_EMAIL=you@example.com
//           Optional: FEEDBACK_FROM_EMAIL (default onboarding@resend.dev),
//                     FEEDBACK_ADMIN_URL  (deep link in the alert email),
//                     FEEDBACK_IP_SALT    (defaults to the service-role key).
//           (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY come from the platform.)
//
// deno-lint-ignore-file no-explicit-any
import { adminClient, adminUrl, cors, guard, json, sendAlert, EMAIL_RE } from '../_shared/guard.ts'

// Mirrors FEEDBACK_LIMITS in src/lib/feedback.ts. Duplicated because this file
// is deployed alone to Deno and cannot import from src/ — a test pins the pair
// together by reading this source.
const LIMITS = {
  message: 4000,
  name: 120,
  email: 200,
}

// How many submissions one sender, and the site as a whole, may make per hour.
const RATE_LIMIT = { perSenderPerHour: 5, sitePerHour: 60 }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const body = await req.json().catch(() => ({}))
    const admin = adminClient()

    // Honeypot → time-on-form → captcha → rate limit, shared with submit-comment.
    const g = await guard(req, body, admin, { table: 'feedback', ...RATE_LIMIT })
    if (g.blocked) return g.blocked

    // Shape. Name and email are optional here — plenty of people want to report
    // something that looks wrong without starting a correspondence. The browser
    // checked all of this already; that copy is advisory, this one is not.
    const message = String(body.message ?? '').trim()
    const name = String(body.name ?? '').trim().slice(0, LIMITS.name)
    const email = String(body.email ?? '').trim().slice(0, LIMITS.email)
    if (!message) return json({ error: 'Please write a message first.' }, 400)
    if (message.length > LIMITS.message) return json({ error: 'That message is too long.' }, 400)
    if (email && !EMAIL_RE.test(email)) {
      return json({ error: 'That email address does not look right.' }, 400)
    }

    const viewUrl = String(body.viewUrl ?? '').slice(0, 2000)
    // The bare path, so the inbox can group by page without parsing URLs.
    let page: string | null = null
    try { page = viewUrl ? new URL(viewUrl).pathname : null } catch { page = null }

    const { error: insErr } = await admin.from('feedback').insert({
      message,
      name: name || null,
      email: email || null,
      page,
      view_url: viewUrl || null,
      user_agent: (req.headers.get('user-agent') ?? '').slice(0, 500) || null,
      ip_hash: g.ipHash,
    })
    if (insErr) {
      console.error('Failed to store feedback:', insErr.message)
      return json({ error: 'Could not send that — please try again.' }, 500)
    }

    // Best effort, and only after the row is committed.
    await sendAlert({
      // The subject carries the page, never the reader's words: a subject line
      // renders somewhere before anyone has decided to trust it.
      subject: `chokkablog feedback${page ? ` — ${page}` : ''}`,
      lines: [
        message,
        '',
        '—',
        `From: ${name || 'anonymous'}${email ? ` <${email}>` : ' (no email given)'}`,
        viewUrl ? `On: ${viewUrl}` : '',
        `Inbox: ${adminUrl()}`,
      ],
      ...(email ? { replyTo: email } : {}),
    }).catch((e) => console.error('Feedback stored but the alert email failed:', e))

    return json({ ok: true })
  } catch (e) {
    console.error(e)
    return json({ error: e instanceof Error ? e.message : 'Unexpected error' }, 500)
  }
})
