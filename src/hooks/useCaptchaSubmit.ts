import { useState } from 'react'
import { CAPTCHA_ACTIVE } from '../lib/captcha'

/**
 * The captcha half of a public form, shared by all three of them.
 *
 * ⚠ THE PROBLEM IT SOLVES. Every form here refuses to send without a verified
 * token, and the widget is only solved when the reader gets round to it. The
 * obvious handling — "please complete the captcha", then wait for another press
 * of the same button — makes the reader say what they want TWICE. On the
 * one-field sign-up that happens on every single attempt, because there is
 * nothing to type that would make you pause long enough to solve the captcha
 * first, and it is precisely where a mildly interested reader gives up.
 *
 * So a press with no token ARMS the form, and solving the captcha sends it.
 *
 * ⚠ TWO RULES KEEP THAT SAFE, and both are the sort of thing that looks like
 * needless caution until it happens:
 *
 *   `armed` is set ONLY by a real press. hCaptcha re-verifies by itself when a
 *   token expires, and without this that token would post the form behind the
 *   reader's back — a comment they had not finished writing, sent.
 *
 *   A failed send disarms BEFORE clearing the token. Clearing it remounts the
 *   widget (see the note in components/Captcha.tsx), which mints a fresh one; a
 *   form still armed at that moment would resubmit the request that has just
 *   failed, and again, for as long as it kept failing.
 *
 * Lives here rather than in each form because one rule in three copies is one
 * rule that will disagree with itself — the same reasoning as
 * supabase/functions/_shared/guard.ts on the server side.
 */
export function useCaptchaSubmit(
  /** Do the actual send. Return true when it worked; false resets the captcha
   *  so the reader can try again with a fresh token. Owns its own error and
   *  "sending" state — this hook is about the token and nothing else. */
  send: (token: string | null) => Promise<boolean>,
) {
  const [token, setToken] = useState<string | null>(null)
  /** Bumped to remount the captcha — see the note in components/Captcha.tsx. */
  const [attempt, setAttempt] = useState(0)
  /** They have pressed the button and are now solving the captcha. */
  const [armed, setArmed] = useState(false)

  const run = async (t: string | null) => {
    if (await send(t)) return
    // A verified token cannot be replayed, so a retry needs a fresh one.
    setArmed(false)
    setToken(null)
    setAttempt((a) => a + 1)
  }

  /**
   * Hand to `<Captcha onToken={...}>`. Sends the form if it was waiting for
   * this, and does nothing at all if it was not.
   */
  const onToken = (t: string | null) => {
    setToken(t)
    if (!t || !armed) return
    setArmed(false)
    void run(t)
  }

  /**
   * Call once the form's own validation has passed.
   *
   * Returns 'armed' when it is now waiting for the captcha, so the caller can
   * say so, or 'sending' when the send is under way.
   */
  const submit = (): 'armed' | 'sending' => {
    // With the captcha off there is nothing to wait for, so the press sends —
    // the form never arms, and every "waiting for the captcha" state below stays
    // dead code rather than needing to be unpicked from three forms.
    if (CAPTCHA_ACTIVE && !token) { setArmed(true); return 'armed' }
    void run(token)
    return 'sending'
  }

  /** Give up on a pending press — a validation error, or a cancelled form. */
  const disarm = () => setArmed(false)

  return { token, attempt, armed, onToken, submit, disarm }
}
