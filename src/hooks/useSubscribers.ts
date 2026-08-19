import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export type SubscriberStatus = 'pending' | 'confirmed' | 'unsubscribed' | 'failed'

/** One row of the consent record. Every field here is admin-only and never
 *  leaves the Admin page. */
export interface Subscriber {
  id: string
  created_at: string
  email: string
  source: string
  source_page: string | null
  status: SubscriberStatus
  confirmed_at: string | null
  kit_error: string | null
  admin_note: string | null
}

/**
 * The subscriber list, as Admin sees it.
 *
 * Reads the table directly, which only works for an admin: `subscribers` has no
 * select policy for anyone else and no insert policy for ANYONE — rows arrive
 * through the Edge Functions. See supabase/009_subscribers.sql.
 *
 * ⚠ WHAT THIS IS NOT. It is not the mailing list. Kit is. A row here says
 * somebody asked and when; `status` is only as current as whatever writes back
 * to it, and today nothing does — so a person Kit shows as confirmed still reads
 * `pending` here, and an unsubscribe made through Kit's footer link never
 * arrives at all. The screen says so in as many words, because a list of
 * addresses in an admin panel invites exactly the wrong assumption.
 */
export function useSubscribers() {
  const [items, setItems] = useState<Subscriber[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const read = useCallback(async () => {
    const { data, error } = await supabase
      .from('subscribers')
      .select('id, created_at, email, source, source_page, status, confirmed_at, kit_error, admin_note')
      .order('created_at', { ascending: false })
    if (error) {
      console.error('Failed to load subscribers:', error.message)
      setError(friendlySubscribersError(error.message))
    } else {
      setError(null)
      setItems((data ?? []) as Subscriber[])
    }
    setLoading(false)
  }, [])

  // Declared inside the effect so the first load has a cleanup to attach to: a
  // component unmounted mid-flight must not set state afterwards.
  useEffect(() => {
    let cancelled = false
    void (async () => { if (!cancelled) await read() })()
    return () => { cancelled = true }
  }, [read])

  /**
   * Erase one, for real.
   *
   * ⚠ THIS IS HALF OF AN ERASURE REQUEST, NEVER THE WHOLE OF IT. Deleting here
   * removes the consent record; the person is still on Kit's list and will still
   * receive the next email. The screen says so at the point of clicking, because
   * a deletion that looks complete and is not is worse than no button at all.
   */
  const remove = useCallback(async (id: string): Promise<string | null> => {
    const { error } = await supabase.from('subscribers').delete().eq('id', id)
    if (error) return friendlySubscribersError(error.message)
    await read()
    return null
  }, [read])

  return { items, loading, error, refresh: read, remove }
}

/** Turn a Postgres error into something an author can act on. */
export function friendlySubscribersError(message: string): string {
  if (/row-level security|permission denied/i.test(message)) {
    return 'That was refused. Your session may have expired — reload and sign in again.'
  }
  if (/relation .* does not exist|schema cache/i.test(message)) {
    return 'The subscribers table is not in the database yet — run supabase/009_subscribers.sql.'
  }
  return message
}

/**
 * The list as a CSV, for taking elsewhere.
 *
 * ⚠ THE POINT OF THIS BUTTON. Keeping our own copy of the list is only worth
 * anything if getting it out is one click — otherwise "I can leave Kit whenever
 * I like" is a claim, not a fact. It is also what answers a subject access
 * request without anybody writing SQL.
 *
 * Quoting is the full rule rather than the usual "commas only": an email address
 * cannot contain a comma or a quote, but `source_page` and `admin_note` can, and
 * a note with a stray quote in it silently shifts every later column.
 */
export function subscribersToCsv(items: Subscriber[]): string {
  const cell = (v: string | null) => {
    const s = String(v ?? '')
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const header = ['email', 'status', 'signed_up_at', 'source', 'source_page', 'confirmed_at', 'note']
  const rows = items.map((s) => [
    cell(s.email), cell(s.status), cell(s.created_at), cell(s.source),
    cell(s.source_page), cell(s.confirmed_at), cell(s.admin_note),
  ].join(','))
  // CRLF, which is what the CSV spec says and what stops Excel running the
  // whole file together on Windows.
  return [header.join(','), ...rows].join('\r\n')
}

/** How many are in each state, plus the total. */
export function countByStatus(items: Subscriber[]): Record<SubscriberStatus | 'total', number> {
  const counts = { pending: 0, confirmed: 0, unsubscribed: 0, failed: 0, total: items.length }
  for (const s of items) {
    if (s.status in counts) counts[s.status] += 1
  }
  return counts
}
