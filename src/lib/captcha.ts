/**
 * Whether the public forms can be offered at all.
 *
 * Both public write endpoints fail CLOSED without a captcha: the Edge Function
 * refuses the write when HCAPTCHA_SECRET is unset (see
 * supabase/functions/_shared/guard.ts), because an unprotected public insert is a
 * worse outcome than a form that does not work. So when the site key is missing
 * there is no point rendering a form — it could only ever fail — and the pages
 * say so instead.
 *
 * Set VITE_HCAPTCHA_SITE_KEY (locally and in Vercel) and HCAPTCHA_SECRET (as a
 * Supabase function secret) together. One without the other is a broken form in
 * one direction or an open endpoint in the other. See supabase/README.md.
 *
 * Lives apart from components/Captcha.tsx so that file exports components only,
 * which is what keeps fast refresh working while editing it.
 */
export const HCAPTCHA_SITE_KEY: string = import.meta.env.VITE_HCAPTCHA_SITE_KEY ?? ''

/** True when a public form has any chance of succeeding. */
export const CAPTCHA_CONFIGURED: boolean = HCAPTCHA_SITE_KEY.trim().length > 0
