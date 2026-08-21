import { useEffect, useRef, useState } from 'react'
import { COLORS } from '../constants/colors'
import { Captcha } from './Captcha'
import { RichText } from './RichText'
import { FORMS_AVAILABLE } from '../lib/captcha'
import { useSubscribe } from '../hooks/useSubscribe'
import { useCaptchaSubmit } from '../hooks/useCaptchaSubmit'
import { useSubscribeContent } from '../hooks/useSubscribeContent'
import { FALLBACK_SUBSCRIBE_CONTENT } from '../constants/subscribe'
import { validateSubscribe, SUBSCRIBE_LIMITS } from '../lib/subscribe'

/**
 * "Tell me when there's something worth reading" — under every post, under every
 * archive post, and on the home page.
 *
 * The address goes to the `subscribe` Edge Function, which records the consent;
 * the browser then hands it to Kit, which sends the confirmation email and owns
 * the list. Nobody is on the list until they click that link, which is why the
 * confirmation below talks about an email rather than about being subscribed.
 *
 * The pitch is editable in Admin (supabase/010_subscribe.sql). The SMALL PRINT
 * IS NOT — see the note on it below.
 *
 * ⚠ THE CAPTCHA IS DEFERRED UNTIL SOMEONE TYPES. hCaptcha is ~10 kB of
 * third-party JavaScript in an iframe, and this box is now on nearly every page
 * on the site. Rendering the widget up front would put that cost on every reader
 * to serve the few who sign up. So the field is always visible (a sign-up box
 * nobody can see does not work) and the widget mounts on first input. Do not
 * "simplify" this by rendering Captcha unconditionally.
 */
export function SubscribeBox({ prominent = false }: {
  /** The home page's copy: a heavier frame, because it is competing with the
   *  tools grid rather than sitting at the end of something already read. */
  prominent?: boolean
}) {
  // ⚠ THE GUARD IS A SEPARATE COMPONENT FROM THE FORM, and that is not
  // ceremony. Hooks must run before any conditional return, so a single
  // component would query the database for its wording on every page view even
  // where the box can never render. Splitting it means the read happens only
  // when there is something to read it for.
  //
  // Only when the write path can work at all — which, with the captcha off, is
  // always. Silent rather than apologetic when it cannot: an absent sign-up box
  // is unremarkable, where "sign-ups are not open" invites a reader to keep
  // checking back for something that was never announced.
  if (!FORMS_AVAILABLE) return null
  return <SubscribeForm prominent={prominent} />
}

function SubscribeForm({ prominent }: { prominent: boolean }) {
  const subscribe = useSubscribe()
  const { content, failed } = useSubscribeContent()
  // ⚠ Falls back on an EMPTY read as well as a failed one — an unlabelled button
  // is nobody's decision. See src/constants/subscribe.ts.
  const words = failed || !content ? FALLBACK_SUBSCRIBE_CONTENT : content
  // A blank heading HIDES it — that is an editorial decision somebody can make.
  // A blank button is not a decision anybody would make, so that one falls back.
  const button = words.button.trim() || FALLBACK_SUBSCRIBE_CONTENT.button

  const [email, setEmail] = useState('')
  const [website, setWebsite] = useState('')   // honeypot
  /** Set the moment the reader shows intent; gates the third-party iframe. */
  const [engaged, setEngaged] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  const shownAt = useRef(0)
  useEffect(() => { shownAt.current = Date.now() }, [])

  /**
   * The send itself, separated from the press.
   *
   * ⚠ PRESSING THE BUTTON WITHOUT SOLVING THE CAPTCHA ARMS THE FORM rather than
   * scolding the reader; solving it then sends. See hooks/useCaptchaSubmit.ts
   * for why, and for the two rules that stop that being dangerous.
   */
  const captcha = useCaptchaSubmit(async (captchaToken) => {
    setSending(true)
    const res = await subscribe({
      email,
      token: captchaToken,
      elapsedMs: Date.now() - shownAt.current,
      website,
    })
    setSending(false)

    if (res.ok) { setSent(true); return true }
    setError(res.error ?? 'Could not sign you up — please try again.')
    return false
  })

  const send = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const invalid = validateSubscribe(email)
    if (invalid) { captcha.disarm(); setError(invalid); return }

    captcha.submit()
  }

  const frame = prominent
    ? { borderColor: COLORS.accent, background: COLORS.accentSoft }
    : { borderColor: COLORS.border, background: COLORS.tint }

  if (sent) {
    return (
      <section className="mt-12 rounded-lg border p-5" style={frame}>
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
      className={`${prominent ? 'mt-14' : 'mt-12'} rounded-lg border p-5`}
      style={frame}
      aria-labelledby="sub-heading"
    >
      {words.heading.trim() && (
        <h2
          id="sub-heading"
          className="text-[11px] font-semibold uppercase mb-2"
          style={{ color: COLORS.accent, letterSpacing: '2px' }}
        >
          {words.heading}
        </h2>
      )}

      {words.intro.trim() && (
        <div className="text-[15px] leading-relaxed mb-4" style={{ color: COLORS.ink }}>
          <RichText text={words.intro} id="subscribe-intro" />
        </div>
      )}

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
            disabled={sending || captcha.armed}
            className="px-4 py-2 text-sm font-semibold rounded text-white cursor-pointer disabled:opacity-50 whitespace-nowrap"
            style={{ backgroundColor: COLORS.ink }}
          >
            {/* Three states, because two of them are waiting for different
                things and a reader who cannot tell them apart presses the
                button again. */}
            {sending ? 'Signing you up…' : captcha.armed ? 'Waiting for the captcha…' : button}
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

        {engaged && <Captcha key={captcha.attempt} onToken={captcha.onToken} />}

        {/* Not red, and not an error: being asked to prove you are human is not
            a mistake the reader made. It also PROMISES the auto-submit, so the
            form finishing by itself a moment later reads as the thing that was
            described rather than as a surprise. */}
        {captcha.armed && !error && (
          <p className="text-sm m-0" style={{ color: COLORS.ink }} role="status">
            Just tick the box above — you will be signed up as soon as you do.
          </p>
        )}

        {error && (
          <p className="text-sm m-0" style={{ color: COLORS.negative }} role="alert">{error}</p>
        )}

        <SubscribeSmallPrint />
      </form>
    </section>
  )
}

/**
 * The disclosure under the field.
 *
 * ⚠ HARD-CODED, AND IT MUST STAY THAT WAY. Everything above it is editable in
 * Admin; this is not, because it is the information UK GDPR expects at the point
 * of collection — what happens next, what the address is used for, that it is
 * never shared, that leaving is one click, and where the full notice is. A pitch
 * can be rewritten freely; a disclosure that can be edited is one that can be
 * edited into a lie by somebody in a hurry, and the person harmed by that is a
 * reader, not the person who edited it.
 *
 * Exported so the comment form's opt-in can show the identical words. A second
 * copy of this, phrased slightly differently, is how one of them ends up wrong.
 */
export function SubscribeSmallPrint() {
  return (
    <p className="text-[11px] m-0" style={{ color: COLORS.faint }}>
      You will get an email asking you to confirm. Your address is used for
      nothing but these notifications, it is never shared or sold, and every
      email has an unsubscribe link. The list is managed by Kit — see the{' '}
      <a href="/privacy" style={{ color: COLORS.accent }}>privacy notice</a>.
    </p>
  )
}
