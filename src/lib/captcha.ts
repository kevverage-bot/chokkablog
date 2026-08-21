/**
 * The captcha switch, and what the public forms can do without one.
 *
 * ⚠ CURRENTLY OFF. The three public forms — sign-up, comments, feedback — send
 * with no captcha at all. The reasoning is a judgement about this site rather
 * than about captchas: an unread blog's problem is silence, not spam, and a
 * widget in front of a one-field sign-up costs more genuine readers than it
 * stops bots. Turn it back on the day that stops being true.
 *
 * TO TURN IT BACK ON, both halves, in this order:
 *
 *   1. `CAPTCHA_ON = true` in supabase/functions/_shared/guard.ts, and deploy
 *      the three functions (subscribe, submit-comment, submit-feedback).
 *   2. `CAPTCHA_ON = true` here, and push.
 *
 *   That order, because a browser sending no token to a server that demands one
 *   is a form that silently fails. The other order is only a widget nobody is
 *   checking. src/__tests__/publicWrite.test.ts fails while the two disagree, so
 *   a half-done flip cannot reach production quietly — it just cannot tell you
 *   WHICH half, hence the order above.
 *
 * ⚠ WHAT IS STILL GUARDING THE ENDPOINTS while this is off: the honeypot field,
 * the time-on-form floor, and the two rate limits — per sender and site-wide,
 * both per hour. Those are all in the shared guard, they are unchanged, and the
 * site-wide cap is what keeps a bad night bounded. What is gone is the only
 * check a determined script could not simply read this file and satisfy.
 */
export const CAPTCHA_ON = false

/**
 * Both public write endpoints fail CLOSED on a missing secret while the captcha
 * is on (see supabase/functions/_shared/guard.ts), because an unprotected public
 * insert is a worse outcome than a form that does not work. So with no site key
 * there would be nothing to render — a form that could only ever fail.
 *
 * Set VITE_HCAPTCHA_SITE_KEY (locally and in Vercel) and HCAPTCHA_SECRET (as a
 * Supabase function secret) together. One without the other is a broken form in
 * one direction or an open endpoint in the other. See supabase/README.md.
 *
 * Lives apart from components/Captcha.tsx so that file exports components only,
 * which is what keeps fast refresh working while editing it.
 */
export const HCAPTCHA_SITE_KEY: string = import.meta.env.VITE_HCAPTCHA_SITE_KEY ?? ''

/** Whether to render the widget and wait for a token. */
export const CAPTCHA_ACTIVE: boolean = CAPTCHA_ON && HCAPTCHA_SITE_KEY.trim().length > 0

/**
 * True when a public form has any chance of succeeding.
 *
 * With the captcha off that is always — the endpoints no longer ask for a token,
 * so a missing site key stops mattering. With it on, a form is offered only when
 * the key is there to make it work.
 */
export const FORMS_AVAILABLE: boolean = !CAPTCHA_ON || CAPTCHA_ACTIVE
