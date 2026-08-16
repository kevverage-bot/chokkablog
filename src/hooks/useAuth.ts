import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import type { User } from '@supabase/supabase-js'

/**
 * The signed-in user and their profile row.
 *
 * `role` is the ONLY thing that grants write access, and it is read from the
 * `profiles` table rather than from anything the client controls. The value here
 * decides what the UI offers; `public.is_admin()` in the database decides what
 * actually gets written (see supabase/001_profiles.sql). Both have to agree for
 * an edit to land, and the database is the one that matters — an attacker can
 * make this hook say 'admin' by editing memory in a debugger, and still write
 * nothing.
 */
export type UserRole = 'pending' | 'user' | 'admin'

export interface Profile {
  id: string
  email: string
  full_name: string | null
  role: UserRole
}

interface AuthState {
  user: User | null
  profile: Profile | null
  loading: boolean
}

export function useAuth(): AuthState & { signOut: () => Promise<void> } {
  const [state, setState] = useState<AuthState>({
    user: null,
    profile: null,
    loading: true,
  })

  useEffect(() => {
    let cancelled = false

    async function loadProfile(user: User) {
      // maybeSingle, not single: a brand-new auth user whose profile trigger has
      // not fired yet has no row, and `single` treats that as an error and logs
      // noise on every sign-in. No row simply means no role, i.e. not an admin.
      const { data } = await supabase
        .from('profiles')
        .select('id, email, full_name, role')
        .eq('id', user.id)
        .maybeSingle()

      if (!cancelled) {
        setState({ user, profile: data as Profile | null, loading: false })
      }
    }

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (cancelled) return
      if (user) loadProfile(user)
      else setState({ user: null, profile: null, loading: false })
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return
      if (session?.user) loadProfile(session.user)
      else setState({ user: null, profile: null, loading: false })
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [])

  const signOut = async () => {
    await supabase.auth.signOut()
    setState({ user: null, profile: null, loading: false })
  }

  return { ...state, signOut }
}
