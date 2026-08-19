// Supabase Edge Function: submit-comment
//
// The public write path for reader comments beneath a post. Same reasoning as
// submit-feedback — RLS cannot enforce a captcha and the anon key is public — so
// `comments` grants an insert to admins only, and this verifies the captcha
// server-side before inserting with the service-role key.
//
// Every comment lands as 'pending'. Nothing is publicly readable until it is
// approved: the public view (comments_public) selects only status = 'approved',
// and does not select the email column at all.
//
// Deploy:   supabase functions deploy submit-comment
// Secrets:  shared with submit-feedback — HCAPTCHA_SECRET, RESEND_API_KEY,
//           FEEDBACK_TO_EMAIL (+ optional FEEDBACK_FROM_EMAIL,
//           FEEDBACK_ADMIN_URL, FEEDBACK_IP_SALT).
//
// deno-lint-ignore-file no-explicit-any
import { adminClient, adminUrl, cors, guard, json, sendAlert, EMAIL_RE } from '../_shared/guard.ts'

// Mirrors COMMENT_LIMITS in src/lib/comments.ts — a test pins the pair together
// by reading this source.
const LIMITS = { body: 2000, name: 80, email: 200 }

// Tighter than feedback: a comment thread is a place people return to, so the
// per-sender ceiling is about the pace of a conversation, not just abuse.
const RATE_LIMIT = { perSenderPerHour: 4, sitePerHour: 40 }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const body = await req.json().catch(() => ({}))
    const admin = adminClient()

    const g = await guard(req, body, admin, { table: 'comments', ...RATE_LIMIT })
    if (g.blocked) return g.blocked

    // Unlike feedback, the name and the email are both required: a comment is
    // published under a name, and a real address is the price of that.
    const text = String(body.body ?? '').trim()
    const name = String(body.name ?? '').trim()
    const email = String(body.email ?? '').trim()
    if (!text) return json({ error: 'Please write a comment first.' }, 400)
    if (text.length > LIMITS.body) return json({ error: 'That comment is too long.' }, 400)
    if (!name) return json({ error: 'Please add your name.' }, 400)
    if (name.length > LIMITS.name) return json({ error: 'That name is too long.' }, 400)
    if (!email || email.length > LIMITS.email || !EMAIL_RE.test(email)) {
      return json({ error: 'Please give a valid email address.' }, 400)
    }

    // The post must exist AND be published — otherwise a comment could be hung
    // off a draft, or off an id that was never on the site at all. (`insights`
    // is the posts table; see supabase/007_comments.sql.)
    const postId = String(body.postId ?? '')
    if (!postId) return json({ error: 'Missing post.' }, 400)
    const { data: post } = await admin
      .from('insights')
      .select('id, headline, slug, published')
      .eq('id', postId)
      .maybeSingle()
    if (!post || post.published !== true) {
      return json({ error: 'Comments are not open on this page.' }, 400)
    }

    const { error: insErr } = await admin.from('comments').insert({
      post_id: postId,
      author_name: name,
      email,
      body: text,
      status: 'pending',
      view_url: String(body.viewUrl ?? '').slice(0, 2000) || null,
      user_agent: (req.headers.get('user-agent') ?? '').slice(0, 500) || null,
      ip_hash: g.ipHash,
    })
    if (insErr) {
      console.error('Failed to store comment:', insErr.message)
      return json({ error: 'Could not save that — please try again.' }, 500)
    }

    // ─── The optional sign-up ───
    // ⚠ WHY THIS LIVES IN THE COMMENT FUNCTION AT ALL, rather than the browser
    // calling `subscribe` afterwards: a verified hCaptcha token CANNOT BE
    // REPLAYED, and this request just spent it. A second call would need a
    // second captcha, which is an absurd thing to put in front of somebody who
    // has already proved they are a person thirty seconds ago. So the row is
    // written here, under the captcha that was already verified, and the browser
    // does only the Kit handover — which needs no token, and which Kit will
    // accept only from a browser anyway (see supabase/functions/subscribe).
    //
    // ⚠ AND IT MUST BE AN EXPLICIT, SEPARATE ACT. `subscribe` is a box the
    // reader ticked, unticked by default, distinct from posting the comment.
    // Consent has to be freely given and specific; an address collected so a
    // comment can be replied to is NOT consent to a mailing list, and quietly
    // enrolling every commenter would be both unlawful and the fastest way to
    // collect spam complaints.
    const wantsEmails = body.subscribe === true
    if (wantsEmails) {
      let sourcePage: string | null = null
      try {
        const v = String(body.viewUrl ?? '')
        sourcePage = v ? new URL(v).pathname : null
      } catch { sourcePage = null }

      // Same upsert as the sign-up box: lowercased to match the check
      // constraint, and `status` absent so an existing 'confirmed' row is not
      // demoted. A failure here must NOT fail the comment — the reader's words
      // are the thing they came to give, and losing them over a mailing list
      // would be the wrong way round.
      const { error: subErr } = await admin
        .from('subscribers')
        .upsert({
          email: email.toLowerCase(),
          source: 'site',
          source_page: sourcePage,
          view_url: String(body.viewUrl ?? '').slice(0, 2000) || null,
          user_agent: (req.headers.get('user-agent') ?? '').slice(0, 500) || null,
          ip_hash: g.ipHash,
        }, { onConflict: 'email', ignoreDuplicates: false })
      if (subErr) console.error('Comment saved but the sign-up was not recorded:', subErr.message)
    }

    // Best effort, and only after the row is committed.
    await sendAlert({
      subject: `chokkablog comment awaiting review — ${post.headline ?? post.slug ?? 'a post'}`,
      lines: [
        text,
        '',
        '—',
        `From: ${name} <${email}>`,
        post.slug ? `On: https://chokkablog.com/blog/${post.slug}` : '',
        `Approve or bin it: ${adminUrl()}`,
      ],
      replyTo: email,
    }).catch((e) => console.error('Comment stored but the alert email failed:', e))

    // `subscribed` tells the browser to make the Kit handover, nothing more. It
    // echoes what the reader asked for on this request and reveals nothing about
    // whether they were already on the list — see the note in hooks/useSubscribe.ts.
    return json({ ok: true, subscribed: wantsEmails })
  } catch (e) {
    console.error(e)
    return json({ error: e instanceof Error ? e.message : 'Unexpected error' }, 500)
  }
})
