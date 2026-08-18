import { describe, it, expect } from 'vitest'
import vercel from '../../vercel.json'
import TRIGGER_FN from '../../supabase/functions/trigger-rebuild/index.ts?raw'
import CRON_FN from '../../api/rebuild.ts?raw'

/**
 * The rebuild path, which exists because the site is prerendered: a published
 * post reaches search engines, feed readers and link previews only when the site
 * is BUILT. Two ways to trigger that — a button in Admin, and a nightly cron —
 * and a handful of ways for either to be quietly broken.
 */

describe('the SPA catch-all does not swallow the cron endpoint', () => {
  // The rewrite sends every extensionless path to index.html so a post published
  // since the last build still resolves. /api/rebuild is extensionless too, so
  // without the exclusion the scheduler would get the home page, 200, and the
  // build would never run — a failure that looks exactly like success.
  const rewrite = vercel.rewrites[0]
  const re = new RegExp(`^${rewrite.source}$`)

  it('still catches ordinary pages', () => {
    for (const path of ['/blog', '/blog/some-post', '/admin', '/login']) {
      expect(re.test(path)).toBe(true)
    }
  })

  it('leaves /api alone', () => {
    expect(re.test('/api/rebuild')).toBe(false)
  })

  it('leaves real files alone', () => {
    for (const path of ['/rss.xml', '/sitemap.xml', '/favicon.ico']) {
      expect(re.test(path)).toBe(false)
    }
  })
})

describe('the cron', () => {
  const cron = vercel.crons?.[0]

  it('points at a path that exists as a function', () => {
    expect(cron?.path).toBe('/api/rebuild')
  })

  it('runs once a day, which is all a Hobby project may do', () => {
    // Five fields, and neither of the first two may be a wildcard or a step, or
    // Vercel rejects the deployment on a Hobby plan.
    const parts = (cron?.schedule ?? '').split(' ')
    expect(parts).toHaveLength(5)
    expect(parts[0]).toMatch(/^\d+$/)
    expect(parts[1]).toMatch(/^\d+$/)
  })
})

describe('neither trigger is open to the internet', () => {
  it('the cron endpoint requires the scheduler’s secret', () => {
    expect(CRON_FN).toMatch(/Bearer \$\{secret\}/)
  })

  it('the cron endpoint refuses when the secret is unset, rather than allowing', () => {
    // The wrong way round here is an open build trigger anyone can hammer.
    expect(CRON_FN).toMatch(/if \(!secret\)[\s\S]{0,160}503/)
  })

  it('the Admin button checks the caller is an admin, in the database', () => {
    expect(TRIGGER_FN).toMatch(/rpc\('is_admin'\)/)
    expect(TRIGGER_FN).toMatch(/isAdmin !== true/)
  })

  it('keeps the deploy hook server-side', () => {
    // The hook URL is a credential: anyone holding it can start builds. If it
    // ever appears in src/, it ships in the bundle to every reader.
    expect(TRIGGER_FN).toContain("Deno.env.get('VERCEL_DEPLOY_HOOK_URL')")
    expect(CRON_FN).toContain('process.env.DEPLOY_HOOK_URL')
  })
})
