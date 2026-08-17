import { useEffect, useRef, useState } from 'react'
import { COLORS } from '../constants/colors'
import { Captcha } from './Captcha'
import { HCAPTCHA_SITE_KEY } from '../lib/captcha'
import { useSendFeedback } from '../hooks/useSendFeedback'
import { validateFeedback, FEEDBACK_LIMITS } from '../lib/feedback'

/**
 * The feedback form, over the page it was opened from.
 *
 * A modal rather than a page of its own, deliberately: the message travels with
 * the URL the reader was looking at, and most feedback on a site of numbers is
 * "this one looks wrong" — which is unreproducible without knowing where they
 * were. Navigating away to a contact page would throw that context out.
 */
export function FeedbackModal({ onClose }: { onClose: () => void }) {
  const send = useSendFeedback()
  const [message, setMessage] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [website, setWebsite] = useState('')   // honeypot
  const [token, setToken] = useState<string | null>(null)
  /** Bumped to remount the captcha — see the note in components/Captcha.tsx. */
  const [attempt, setAttempt] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  const openedAt = useRef(0)
  useEffect(() => { openedAt.current = Date.now() }, [])

  // Escape closes it. A modal with no keyboard way out is a trap for anyone not
  // using a mouse.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const invalid = validateFeedback({ message, name, email })
    if (invalid) { setError(invalid); return }
    if (HCAPTCHA_SITE_KEY && !token) { setError('Please complete the captcha.'); return }

    setSending(true)
    const res = await send({
      message, name, email, token,
      elapsedMs: Date.now() - openedAt.current,
      website,
    })
    setSending(false)

    if (res.ok) { setSent(true); return }
    setToken(null)
    setAttempt((a) => a + 1)
    setError(res.error ?? 'Could not send that — please try again.')
  }

  const inputCls = 'w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2'
  const inputStyle = { borderColor: COLORS.border, color: COLORS.ink }
  const labelCls = 'block text-xs font-semibold mb-1 uppercase'
  const labelStyle = { color: COLORS.faint, letterSpacing: '1px' }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-8"
      style={{ background: 'rgba(26,26,26,0.45)' }}
      // A click on the backdrop closes; a click inside must not bubble out to it.
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="fb-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-lg p-5 mt-8"
        style={{ background: 'white' }}
      >
        <div className="flex items-start justify-between gap-4 mb-1">
          <h2 id="fb-title" className="text-lg font-bold m-0" style={{ color: COLORS.ink }}>
            {sent ? 'Thank you' : 'Feedback'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="cursor-pointer bg-transparent border-none p-0 text-lg leading-none"
            style={{ color: COLORS.faint }}
          >
            ×
          </button>
        </div>

        {sent ? (
          <>
            <p className="text-sm" style={{ color: COLORS.muted }}>
              Your message has been sent. If you left an address, you may get a
              reply — not every message needs one.
            </p>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-1.5 text-xs font-semibold rounded text-white cursor-pointer"
                style={{ backgroundColor: COLORS.ink }}
              >
                Close
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <p className="text-sm mt-0 mb-1" style={{ color: COLORS.muted }}>
              Corrections, disagreements and things that look wrong are all
              welcome. The page you are on is sent with the message.
            </p>

            <div>
              <label htmlFor="fb-message" className={labelCls} style={labelStyle}>Message</label>
              <textarea
                id="fb-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={6}
                maxLength={FEEDBACK_LIMITS.message}
                required
                autoFocus
                spellCheck
                className={inputCls}
                style={{ ...inputStyle, resize: 'vertical' }}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="fb-name" className={labelCls} style={labelStyle}>
                  Name <span className="normal-case font-normal">(optional)</span>
                </label>
                <input
                  id="fb-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={FEEDBACK_LIMITS.name}
                  className={inputCls}
                  style={inputStyle}
                />
              </div>
              <div>
                <label htmlFor="fb-email" className={labelCls} style={labelStyle}>
                  Email <span className="normal-case font-normal">(optional)</span>
                </label>
                <input
                  id="fb-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  maxLength={FEEDBACK_LIMITS.email}
                  className={inputCls}
                  style={inputStyle}
                />
              </div>
            </div>
            <p className="text-[11px] m-0" style={{ color: COLORS.faint }}>
              Nothing here is published. An address is only needed if you want a
              reply.
            </p>

            {/* Honeypot — see the note in PostComments. */}
            <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px' }}>
              <label htmlFor="fb-website">Website</label>
              <input
                id="fb-website"
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
              />
            </div>

            <Captcha key={attempt} onToken={setToken} />

            {error && (
              <p className="text-sm m-0" style={{ color: COLORS.negative }} role="alert">{error}</p>
            )}

            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-1.5 text-xs rounded border cursor-pointer"
                style={{ borderColor: COLORS.border, color: COLORS.muted }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={sending}
                className="px-4 py-1.5 text-xs font-semibold rounded text-white cursor-pointer disabled:opacity-50"
                style={{ backgroundColor: COLORS.ink }}
              >
                {sending ? 'Sending…' : 'Send'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
