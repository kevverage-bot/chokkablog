/**
 * The nightly rebuild, as a Vercel Function.
 *
 * WHY. The site's sitemap, RSS feed and per-post HTML are written at build time
 * (scripts/prerender.mjs), so a post published in Admin is invisible to search
 * engines, feed readers and link previews until the next deploy. The "Rebuild
 * now" button in Admin covers "I want this out immediately"; this covers the day
 * the button is forgotten, which is the failure that is otherwise silent.
 *
 * Vercel's scheduler can only call a path inside the deployment, which is why
 * this exists at all: it is a doorbell that rings the Deploy Hook. It is the ONLY
 * server-side code in an otherwise entirely static site.
 *
 * ⚠ NOT PUBLIC. Anyone who could call this could burn build minutes at will, so
 * it requires the CRON_SECRET that Vercel sends with every scheduled invocation.
 * Missing secret = refuse, never "allow because it is not configured": the wrong
 * way round here is an open build trigger.
 *
 * Setup (both in Vercel → Settings → Environment Variables):
 *   CRON_SECRET        any long random string; Vercel sends it as a Bearer token
 *   DEPLOY_HOOK_URL    the Deploy Hook from Settings → Git → Deploy Hooks
 *
 * The schedule lives in vercel.json.
 */
export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.error('CRON_SECRET is not set — refusing to trigger a build')
    return json({ error: 'Not configured' }, 503)
  }
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    // Deliberately terse: an endpoint that explains why it said no is an
    // endpoint that helps you guess.
    return json({ error: 'Not allowed' }, 401)
  }

  const hook = process.env.DEPLOY_HOOK_URL
  if (!hook) {
    console.error('DEPLOY_HOOK_URL is not set — nothing to call')
    return json({ error: 'Not configured' }, 503)
  }

  const res = await fetch(hook, { method: 'POST' })
  if (!res.ok) {
    console.error('Deploy hook rejected the request:', res.status, await res.text())
    return json({ error: 'Deploy hook refused' }, 502)
  }

  // This build's own deployment is what answers the NEXT scheduled call, so
  // there is no loop here: the schedule fires once a day, whatever is deployed.
  console.log('Nightly rebuild triggered')
  return json({ ok: true })
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
