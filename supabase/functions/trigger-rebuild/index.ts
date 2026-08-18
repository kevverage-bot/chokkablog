// Supabase Edge Function: trigger-rebuild
//
// The "Rebuild now" button in Admin. Verifies the caller is an admin, then POSTs
// to a Vercel Deploy Hook, which starts a production build.
//
// WHY IT EXISTS. The site is prerendered at build time: sitemap.xml, rss.xml and
// each post's real HTML (title, description, share card) are written by
// scripts/prerender.mjs during the build. A post published in Admin is live for
// readers immediately — the app reads the database — but it is absent from all
// three until the next deploy. Sharing a brand-new post before then produces a
// bare link with no preview, which is the exact thing prerendering was added to
// prevent. This closes that gap from the page where the publishing happens.
//
// ⚠ THE HOOK URL IS A CREDENTIAL. Anyone holding it can start builds on the
// project, so it lives here as a secret and never in the browser. That is the
// whole reason this is a function rather than a fetch from Admin — the URL would
// otherwise ship in the JS bundle for everyone.
//
// Deploy:   supabase functions deploy trigger-rebuild
// Secrets:  supabase secrets set VERCEL_DEPLOY_HOOK_URL=https://api.vercel.com/v1/integrations/deploy/…
//           (SUPABASE_URL / SUPABASE_ANON_KEY come from the platform.)
//
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(payload: any, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    // Unlike the public write paths, this one is NOT open to the internet: it
    // costs money and build minutes, so it is gated on a real session rather
    // than on a captcha.
    const authHeader = req.headers.get('Authorization') ?? ''
    if (!authHeader) return json({ error: 'Not signed in.' }, 401)

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )

    const { data: userData, error: userErr } = await userClient.auth.getUser()
    if (userErr || !userData?.user) return json({ error: 'Not signed in.' }, 401)

    // The same public.is_admin() every write policy in the database calls, so
    // there is one definition of "admin" and this cannot drift from it.
    const { data: isAdmin, error: adminErr } = await userClient.rpc('is_admin')
    if (adminErr) return json({ error: `Admin check failed: ${adminErr.message}` }, 500)
    if (isAdmin !== true) return json({ error: 'Not allowed.' }, 403)

    const hook = Deno.env.get('VERCEL_DEPLOY_HOOK_URL')
    if (!hook) {
      console.error('VERCEL_DEPLOY_HOOK_URL is not set')
      return json({ error: 'No deploy hook configured — see supabase/README.md.' }, 503)
    }

    const res = await fetch(hook, { method: 'POST' })
    if (!res.ok) {
      const body = await res.text()
      console.error('Deploy hook rejected the request:', res.status, body)
      return json({ error: `Vercel refused the build (${res.status}).` }, 502)
    }

    // Vercel answers with the job it queued. Returned as-is so Admin can say
    // something more useful than "probably worked".
    const job = await res.json().catch(() => ({}))
    return json({ ok: true, job })
  } catch (e) {
    console.error(e)
    return json({ error: e instanceof Error ? e.message : 'Unexpected error' }, 500)
  }
})
