import { useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { readFunctionError } from '../lib/functionError'

export interface SubscribeSubmission {
  email: string
  token: string | null
  elapsedMs: number
  website: string
}

/**
 * The one way a sign-up leaves the browser.
 *
 * No read half, for the same reason as useSendFeedback: `subscribers` is
 * admin-only in every direction (see supabase/009_subscribers.sql), and this is
 * the table where that matters most — it is a list of bare email addresses.
 *
 * ⚠ THERE IS DELIBERATELY NO "YOU ARE ALREADY SUBSCRIBED" ANSWER, and none
 * should be added. Anyone can POST at this endpoint with anyone else's address,
 * so a reply that distinguished a new sign-up from an existing one would turn
 * the box into an oracle for testing whether a given person reads chokkablog.
 * The function returns the same thing either way; the wording in SubscribeBox
 * matches it.
 */
export function useSubscribe() {
  return useCallback(async (sub: SubscribeSubmission): Promise<{ ok: boolean; error?: string }> => {
    const { data, error } = await supabase.functions.invoke('subscribe', {
      body: {
        email: sub.email.trim(),
        token: sub.token,
        elapsedMs: sub.elapsedMs,
        website: sub.website,
        viewUrl: typeof window === 'undefined' ? '' : window.location.href,
      },
    })
    if (error) return { ok: false, error: await readFunctionError(error, 'Could not sign you up.') }
    if (data && data.ok === false) return { ok: false, error: data.error ?? 'Could not sign you up.' }
    return { ok: true }
  }, [])
}
