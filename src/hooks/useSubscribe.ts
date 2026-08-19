import { useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { readFunctionError } from '../lib/functionError'
import { handOverToKit } from '../lib/subscribe'

export interface SubscribeSubmission {
  email: string
  token: string | null
  elapsedMs: number
  website: string
}

/**
 * The one way a sign-up leaves the browser — in two steps, in this order.
 *
 *   1. The `subscribe` Edge Function: captcha, rate limit, and the consent row.
 *   2. Kit, posted to DIRECTLY FROM HERE, which is what sends the confirmation
 *      email.
 *
 * ⚠ STEP 2 IS CLIENT-SIDE ON PURPOSE AND MUST STAY THERE. Kit's form endpoint
 * quarantines submissions from datacentre IPs — the Edge Function's request came
 * back 200 with `"status":"quarantined"` while the identical one from a browser
 * succeeded. See the long note in src/lib/subscribe.ts. Moving this onto the
 * server would look tidier and would silently stop every confirmation email.
 *
 * ⚠ AND THE ORDER MATTERS. The consent record is committed before Kit is
 * touched, so a Kit failure costs a notification and never the evidence that
 * somebody asked. If step 2 fails the row stays `pending`, which is exactly what
 * that status means — asked, not known to be confirmed.
 *
 * ⚠ THERE IS DELIBERATELY NO "YOU ARE ALREADY SUBSCRIBED" ANSWER, and none
 * should be added. Anyone can POST at either endpoint with anyone else's
 * address, so a reply that distinguished a new sign-up from an existing one
 * would turn the box into an oracle for testing whether a given person reads
 * chokkablog.
 */
export function useSubscribe() {
  return useCallback(async (sub: SubscribeSubmission): Promise<{ ok: boolean; error?: string }> => {
    const email = sub.email.trim()

    const { data, error } = await supabase.functions.invoke('subscribe', {
      body: {
        email,
        token: sub.token,
        elapsedMs: sub.elapsedMs,
        website: sub.website,
        viewUrl: typeof window === 'undefined' ? '' : window.location.href,
      },
    })
    if (error) return { ok: false, error: await readFunctionError(error, 'Could not sign you up.') }
    if (data && data.ok === false) return { ok: false, error: data.error ?? 'Could not sign you up.' }

    // Consent is recorded. Now the part Kit will only accept from a reader.
    return handOverToKit(email)
  }, [])
}
