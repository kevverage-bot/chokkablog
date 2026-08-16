import { supabase } from './supabase'

/**
 * If the URL hash carries access_token + refresh_token, establish the session
 * and strip the hash. This is how a sign-in on one chokka property can hand off
 * to another without a second login, and it is also the shape Supabase's own
 * magic-link and recovery redirects arrive in.
 *
 * Must run before any auth-gated UI renders — see src/main.tsx, which awaits it
 * before mounting.
 */
export async function handleTokenHandoff(): Promise<void> {
  const hash = window.location.hash
  if (!hash) return

  const params = new URLSearchParams(hash.slice(1))
  const accessToken = params.get('access_token')
  const refreshToken = params.get('refresh_token')
  if (!accessToken || !refreshToken) return

  // Strip the hash first, so the tokens are never left sitting in the address
  // bar (or in whatever the reader pastes next).
  history.replaceState(null, '', window.location.pathname + window.location.search)

  await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  })
}
