import { useEffect, useRef, useState } from 'react'
import { COLORS } from '../constants/colors'
import { Captcha } from './Captcha'
import { CAPTCHA_CONFIGURED, HCAPTCHA_SITE_KEY } from '../lib/captcha'
import { useSubscribe } from '../hooks/useSubscribe'
import { validateSubscribe, SUBSCRIBE_LIMITS } from '../lib/subscribe'

/**
 * "Tell me when there's something worth reading" — at the foot of a post.
 *
 * The address goes to the `subscribe` Edge Function, which records the consent
 * and hands the person to Kit; KIT sends the confirmation email and owns the
 * list. Nothing here is on the list until they click that link, which is why the
 * confirmation below talks about an email rather than about being subscribed.
 *
 * ⚠ THE PROMISE IN THE COPY IS LOAD-BEARING. "Only when there is something worth
 * your attention, not every post" is the basis on which consent is given, and it
 * is the thing that keeps this list off spam-complaint lists. If the sending
 * pattern ever changes, this wording has to change first, not after.
 *
 * ⚠ THE CAPTCHA IS DEFERRED UNTIL SOMEONE TYPES. hCaptcha is ~10 kB of
 * third-party JavaScript in an iframe, and this box — unlike the comment form,
 * which hides behind a button — is on every post page. Rendering the widget up
 * front would put that cost on every reader to serve the few who sign up. So the
 * field is always visible (a sign-up box nobody can see does not work) and the
 * widget mounts on first input. Do not "simplify" this by rendering Captcha
 * unconditionally.
 */
export function SubscribeBox() {
  const subscribe = useSubscribe()

  const [email, setEmail] = useState('')
  const [website, setWebsite] = useState('')   // honeypot
  const [token, setToken] = useState<string | null>(null)
  /** Bumped to remount the captcha — see the note in components/Captcha.tsx. */
  const [attempt, setAttempt] = useState(0)
  /** Set the moment the reader shows intent; gates the third-party iframe. */
  const [engaged, setEngaged] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  const shownAt = useRef(0)
  useEffect(() => { shownAt.current = Date.now() }, [])

  // The write path cannot work without a captcha (the Edge Function refuses),
  // so there is nothing to offer. Silent rather than apologetic: an absent
  // sign-up box is unremarkable, where "sign-ups are not open" invites a reader
  // to keep checking back for something that was never announced.
  if (!CAPTCHA_CONFIGURED) return null

  const send = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const invalid = validateSubscribe(email)
    if (invalid) { setError(invalid); return }
    if (HCAPTCHA_SITE_KEY && !token) { setError('Please complete the captcha.'); return }

    setSending(true)
    const res = await subscribe({
      email,
      token,
      elapsedMs: Date.now() - shownAt.current,
      website,
    })
    setSending(false)

    if (res.ok) { setSent(true); return }
    // A verified token cannot be replayed, so a retry needs a fresh one.
    setToken(null)
    setAttempt((a) => a + 1)
    setError(res.error ?? 'Could not sign you up — please try again.')
  }

  if (sent) {
    return (
      <section
        className="mt-12 rounded-lg border p-5"
        style={{ borderColor: COLORS.border, background: COLORS.tint }}
      >
        {/* Deliberately the same answer whether or not the address was already
            known — see the note in hooks/useSubscribe.ts. */}
        <p className="text-sm m-0" style={{ color: COLORS.ink }}>
          Thank you — please check your inbox and click the link to confirm.
          Until you do, you are not on the list.
        </p>
        <p className="text-xs mt-2 mb-0" style={{ color: COLORS.faint }}>
          Nothing arrives? Have a look in your spam folder — and do add the
          sender to your contacts, or the next one will land there too.
        </p>
      </section>
    )
  }

  return (
    <section
      className="mt-12 rounded-lg border p-5"
      style={{ borderColor: COLORS.border, background: COLORS.tint }}
      aria-labelledby="sub-heading"
    >
      <h2
        id="sub-heading"
        className="text-[11px] font-semibold uppercase mb-2"
        style={{ color: COLORS.accent, letterSpacing: '2px' }}
      >
        New posts by email
      </h2>

      <p className="text-[15px] leading-relaxed m-0 mb-4" style={{ color: COLORS.ink }}>
        I write when there is something to say, and I will only email you when I
        think a piece is worth your attention — not every time I post.
      </p>

      <form onSubmit={send} className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-2">
          <label htmlFor="sub-email" className="sr-only">Email address</label>
          <input
            id="sub-email"
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setEngaged(true) }}
            onFocus={() => setEngaged(true)}
            maxLength={SUBSCRIBE_LIMITS.email}
            required
            autoComplete="email"
            placeholder="you@example.com"
            className="flex-1 border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2"
            style={{ borderColor: COLORS.border, color: COLORS.ink, background: 'white' }}
          />
          <button
            type="submit"
            disabled={sending}
            className="px-4 py-2 text-sm font-semibold rounded text-white cursor-pointer disabled:opacity-50 whitespace-nowrap"
            style={{ backgroundColor: COLORS.ink }}
          >
            {sending ? 'Signing you up…' : 'Keep me posted'}
          </button>
        </div>

        {/* Honeypot: off-screen rather than display:none, which some bots check
            for, and out of both the tab order and the accessibility tree. */}
        <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px' }}>
          <label htmlFor="sub-website">Website</label>
          <input
            id="sub-website"
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
        </div>

        {engaged && <Captcha key={attempt} onToken={setToken} />}

        {error && (
          <p className="text-sm m-0" style={{ color: COLORS.negative }} role="alert">{error}</p>
        )}

        <p className="text-[11px] m-0" style={{ color: COLORS.faint }}>
          You will get an email asking you to confirm. Your address is used for
          nothing but these notifications, it is never shared or sold, and every
          email has an unsubscribe link. The list is managed by Kit — see the{' '}
          <a href="/privacy" style={{ color: COLORS.accent }}>privacy notice</a>.
        </p>
      </form>
    </section>
  )
}
