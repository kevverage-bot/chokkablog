// Shared guard for the public write endpoints (submit-feedback, submit-comment).
//
// Both accept writes from anyone on the internet, so both need the identical
// pipeline: honeypot → time-on-form → captcha → rate limit. Duplicating that per
// endpoint is how one of them quietly ends up a year behind the other, so it
// lives here and each function supplies only what differs — its table, its
// limits, its email subject.
//
// Supabase bundles files under functions/_shared/ into every function that
// imports them, so this deploys with each of them.
//
// deno-lint-ignore-file no-explicit-any
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function json(payload: any, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

/** Below this, a "human" filled in the form in under two seconds. Mirrored by
 *  FEEDBACK_LIMITS.minElapsedMs in src/lib/feedback.ts. */
export const MIN_ELAPSED_MS = 2000

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Service-role client: bypasses RLS, which is the whole point — neither table
 *  grants an insert to any other role. */
export function adminClient(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
}

/**
 * A short-circuit Response when the request should not proceed, or null to carry
 * on — plus the `ipHash` for the caller to store.
 *
 * ORDER MATTERS: the free local checks run before the network call to hCaptcha,
 * and the captcha runs before the database is touched at all. A script that
 * cannot pass step 3 never costs a query.
 */
export async function guard(
  req: Request,
  body: any,
  admin: SupabaseClient,
  opts: { table: string; perSenderPerHour: number; sitePerHour: number },
): Promise<{ blocked: Response } | { blocked: null; ipHash: string | null }> {
  // 1. Honeypot — a field no human can see (it is positioned off-screen and out
  //    of the tab order). Answer 200 so a bot learns nothing from being caught.
  if (String(body.website ?? '').trim() !== '') return { blocked: json({ ok: true }) }

  // 2. Time on form. Spoofable by anyone who reads this file; it costs three
  //    lines and stops the naive replay. A real error rather than a silent drop,
  //    so a genuinely fast human can simply press send again.
  const elapsedMs = Number(body.elapsedMs ?? 0)
  if (Number.isFinite(elapsedMs) && elapsedMs > 0 && elapsedMs < MIN_ELAPSED_MS) {
    return { blocked: json({ error: 'That was quick — give it another go.' }, 400) }
  }

  // 3. Captcha. FAILS CLOSED: an unset secret would mean an open endpoint, and a
  //    broken form is much the better failure. This is the only check here that
  //    a determined script cannot simply read and satisfy.
  const secret = Deno.env.get('HCAPTCHA_SECRET')
  if (!secret) {
    console.error('HCAPTCHA_SECRET is not set — refusing the write')
    return { blocked: json({ error: 'Not configured yet. Please try again later.' }, 503) }
  }
  const token = String(body.token ?? '')
  if (!token) return { blocked: json({ error: 'Please complete the captcha.' }, 400) }

  const verifyRes = await fetch('https://api.hcaptcha.com/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ secret, response: token }),
  })
  const verify = await verifyRes.json().catch(() => ({ success: false }))
  if (!verify.success) {
    console.warn('hCaptcha rejected a submission:', verify['error-codes'])
    return { blocked: json({ error: 'Captcha failed — please try again.' }, 400) }
  }

  // 4. Rate limit, on a SALTED hash of the address. The salt defaults to the
  //    service-role key: always present, secret, and stable — which is what
  //    stops a stored hash being walked back to an address (there are only ~4bn
  //    of them, so an unsalted hash is not anonymous at all).
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim()
  const salt = Deno.env.get('FEEDBACK_IP_SALT') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const ipHash = ip ? await sha256Hex(`${salt}:${ip}`) : null

  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  if (ipHash) {
    const { count } = await admin
      .from(opts.table)
      .select('id', { count: 'exact', head: true })
      .eq('ip_hash', ipHash)
      .gte('created_at', hourAgo)
    if ((count ?? 0) >= opts.perSenderPerHour) {
      return { blocked: json({ error: 'Thanks — you have sent a few already. Try again a bit later.' }, 429) }
    }
  }
  // The global cap protects the mailbox on the day somebody gets past the
  // captcha, which is a different failure from one person being a nuisance.
  const { count: siteCount } = await admin
    .from(opts.table)
    .select('id', { count: 'exact', head: true })
    .gte('created_at', hourAgo)
  if ((siteCount ?? 0) >= opts.sitePerHour) {
    return { blocked: json({ error: 'Busy right now — please try again later.' }, 429) }
  }

  return { blocked: null, ipHash }
}

/**
 * Send an alert, best effort.
 *
 * Callers MUST have committed their row first: a mail outage costs a
 * notification, never a reader's words.
 */
export async function sendAlert(opts: {
  subject: string
  lines: string[]
  replyTo?: string
}): Promise<void> {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  const to = Deno.env.get('FEEDBACK_TO_EMAIL')
  if (!apiKey || !to) {
    console.warn('RESEND_API_KEY / FEEDBACK_TO_EMAIL not set — stored but not emailed')
    return
  }
  const from = Deno.env.get('FEEDBACK_FROM_EMAIL') ?? 'chokkablog <onboarding@resend.dev>'

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [to],
      subject: opts.subject,
      text: opts.lines.filter(Boolean).join('\n'),
      ...(opts.replyTo ? { reply_to: opts.replyTo } : {}),
    }),
  })
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`)
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function adminUrl(): string {
  return Deno.env.get('FEEDBACK_ADMIN_URL') ?? 'https://chokkablog.com/admin'
}
