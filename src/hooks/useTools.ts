import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { friendlyHomeError } from './useHomeContent'

/** One tool. Mirrors public.tools — see supabase/005_home.sql. */
export interface Tool {
  id: string
  name: string
  description: string
  url: string
  /** Exists, but not ready for traffic: the card renders as text, not a link. */
  wip: boolean
  /** The grid's order, low first. */
  sort_order: number
}

/** What the home page's card actually needs. The fallback list in
 *  constants/home.ts has no ids or ordering, and does not need any. */
export type ToolCard = Omit<Tool, 'id' | 'sort_order'>

export type ToolDraft = Omit<Tool, 'id'>

const COLUMNS = 'id, name, description, url, wip, sort_order'

/** created_at breaks the tie so the order cannot wobble between loads — the
 *  same ordering the index in 005_home.sql is built for. */
async function fetchTools() {
  return supabase
    .from('tools')
    .select(COLUMNS)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
}

/**
 * The tools grid, and the admin operations on it.
 *
 * Reads are unauthenticated — every row is public, there is no draft gate here
 * (a tool that isn't ready is marked `wip` and shown as text). So the home page
 * and Admin run the same query.
 *
 * `failed` distinguishes "could not read" from "there are none", because the
 * home page falls back to the built-in list for the first and renders nothing
 * for the second. See constants/home.ts.
 */
export function useTools() {
  const [tools, setTools] = useState<Tool[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  const read = useCallback(async () => {
    const { data, error } = await fetchTools()
    if (error) {
      console.error('Failed to load tools:', error.message)
      return { tools: [] as Tool[], failed: true }
    }
    return { tools: (data ?? []) as Tool[], failed: false }
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const r = await read()
      if (cancelled) return
      setTools(r.tools)
      setFailed(r.failed)
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [read])

  const refresh = useCallback(async () => {
    const r = await read()
    setTools(r.tools)
    setFailed(r.failed)
  }, [read])

  /** Each mutation returns null on success, or a message for the author. */
  const create = useCallback(async (draft: ToolDraft): Promise<string | null> => {
    const { error } = await supabase.from('tools').insert(draft)
    if (error) return friendlyToolError(error.message)
    await refresh()
    return null
  }, [refresh])

  const update = useCallback(async (id: string, draft: ToolDraft): Promise<string | null> => {
    const { error } = await supabase.from('tools').update(draft).eq('id', id)
    if (error) return friendlyToolError(error.message)
    await refresh()
    return null
  }, [refresh])

  const remove = useCallback(async (id: string): Promise<string | null> => {
    const { error } = await supabase.from('tools').delete().eq('id', id)
    if (error) return friendlyToolError(error.message)
    await refresh()
    return null
  }, [refresh])

  /**
   * Move one tool up or down the grid.
   *
   * Every row is renumbered from its new position rather than the pair being
   * swapped. Swapping assumes the numbers are already distinct and gap-free,
   * which stops being true the moment a row is deleted or two arrive with the
   * table's default of 0 — and then a move appears to do nothing. Renumbering
   * cannot get into that state.
   */
  const move = useCallback(async (id: string, delta: -1 | 1): Promise<string | null> => {
    const from = tools.findIndex((t) => t.id === id)
    const to = from + delta
    if (from < 0 || to < 0 || to >= tools.length) return null

    const next = [...tools]
    next.splice(to, 0, ...next.splice(from, 1))

    // Optimistic: the grid reorders under the click, and refresh() below has
    // the database confirm it. Left alone, four sequential round-trips make the
    // arrows feel broken.
    setTools(next.map((t, i) => ({ ...t, sort_order: i })))

    const writes = next
      .map((t, i) => ({ t, i }))
      .filter(({ t, i }) => t.sort_order !== i)
      .map(({ t, i }) => supabase.from('tools').update({ sort_order: i }).eq('id', t.id))

    const failure = (await Promise.all(writes)).find((r) => r.error)
    await refresh()
    return failure?.error ? friendlyToolError(failure.error.message) : null
  }, [tools, refresh])

  return { tools, loading, failed, refresh, create, update, remove, move }
}

/** The one constraint an author can trip, said in terms of the form they are
 *  looking at rather than its name in the schema. */
function friendlyToolError(message: string): string {
  if (message.includes('tools_link_needs_url')) {
    return 'A tool needs a link, unless it is marked work in progress.'
  }
  return friendlyHomeError(message)
}
