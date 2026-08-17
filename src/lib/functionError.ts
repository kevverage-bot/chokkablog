/**
 * Dig an Edge Function's own message out of a failed invoke.
 *
 * supabase-js reports every non-2xx as the same flat "Edge Function returned a
 * non-2xx status code", which would turn "please complete the captcha" — a thing
 * the reader can act on — into a thing they cannot. The real message is in the
 * Response attached to the error.
 */
export async function readFunctionError(
  error: unknown,
  fallback = 'Could not send that.',
): Promise<string> {
  const ctx = (error as { context?: unknown })?.context
  if (ctx && typeof (ctx as Response).json === 'function') {
    try {
      const payload = await (ctx as Response).json()
      if (payload?.error) return String(payload.error)
    } catch {
      /* fall through to the generic message */
    }
  }
  return error instanceof Error ? error.message : fallback
}
