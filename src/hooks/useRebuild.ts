import { useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { readFunctionError } from '../lib/functionError'

export type RebuildState = 'idle' | 'working' | 'queued'

/**
 * Ask Vercel for a fresh production build.
 *
 * The deploy hook itself is a credential — anyone holding it can start builds —
 * so it lives as a secret inside the trigger-rebuild Edge Function, and this only
 * knows how to ring the doorbell. See supabase/functions/trigger-rebuild.
 */
export function useRebuild() {
  const [state, setState] = useState<RebuildState>('idle')
  const [error, setError] = useState<string | null>(null)

  const rebuild = useCallback(async () => {
    setState('working')
    setError(null)
    const { data, error } = await supabase.functions.invoke('trigger-rebuild', { body: {} })
    if (error) {
      setError(await readFunctionError(error, 'Could not start the build.'))
      setState('idle')
      return
    }
    if (data && data.ok === false) {
      setError(data.error ?? 'Could not start the build.')
      setState('idle')
      return
    }
    // Stays 'queued' rather than returning to 'idle': the build takes a couple of
    // minutes, and a button that goes straight back to normal invites a second
    // click that queues a second build.
    setState('queued')
  }, [])

  return { state, error, rebuild }
}
