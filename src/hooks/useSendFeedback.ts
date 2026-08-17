import { useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { readFunctionError } from '../lib/functionError'

export interface FeedbackSubmission {
  message: string
  name: string
  email: string
  token: string | null
  elapsedMs: number
  website: string
}

/**
 * The one way feedback leaves the browser.
 *
 * There is no read half: `feedback` is admin-only in every direction (see
 * supabase/006_feedback.sql), so a reader can send and never look — which is
 * exactly right for an inbox. The Admin inbox reads the table with its own hook.
 */
export function useSendFeedback() {
  return useCallback(async (sub: FeedbackSubmission): Promise<{ ok: boolean; error?: string }> => {
    const { data, error } = await supabase.functions.invoke('submit-feedback', {
      body: {
        message: sub.message.trim(),
        name: sub.name.trim(),
        email: sub.email.trim(),
        token: sub.token,
        elapsedMs: sub.elapsedMs,
        website: sub.website,
        viewUrl: typeof window === 'undefined' ? '' : window.location.href,
      },
    })
    if (error) return { ok: false, error: await readFunctionError(error) }
    if (data && data.ok === false) return { ok: false, error: data.error ?? 'Could not send that.' }
    return { ok: true }
  }, [])
}
