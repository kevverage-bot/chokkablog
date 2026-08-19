/**
 * Reading the marks Postgres put in an archive search snippet.
 *
 * `public.search_archive` (supabase/011_archive_search.sql) wraps whatever
 * actually matched in these two sentinels rather than in `<b>`, because the
 * result is rendered by React as a string. Splitting it here and returning plain
 * segments means the highlight becomes a `<mark>` ELEMENT built by React — no
 * markup is ever injected, so a reader's query string cannot become part of the
 * page's HTML however it is spelled.
 *
 * ⚠ These two constants are duplicated in the SQL, which cannot import from
 * here. Change one, change the other; src/__tests__/search.test.ts reads that
 * file and fails if they drift.
 */
export const SNIPPET_OPEN = '[hl]'
export const SNIPPET_CLOSE = '[/hl]'

export interface SnippetPart {
  text: string
  /** True when Postgres marked this run as a match. */
  hit: boolean
}

/**
 * Split a marked snippet into alternating plain and matched runs.
 *
 * Tolerant on purpose. An unbalanced or absent sentinel — a post that genuinely
 * contains "[hl]", a query that matched only the title, an older row served
 * from a cache — yields one plain segment rather than an exception. A search
 * result that renders unhighlighted is a small disappointment; one that throws
 * takes the whole results page down.
 */
export function splitSnippet(snippet: string): SnippetPart[] {
  const text = String(snippet ?? '')
  if (!text) return []

  const parts: SnippetPart[] = []
  let rest = text

  while (rest.length > 0) {
    const open = rest.indexOf(SNIPPET_OPEN)
    if (open < 0) { parts.push({ text: rest, hit: false }); break }

    const close = rest.indexOf(SNIPPET_CLOSE, open + SNIPPET_OPEN.length)
    if (close < 0) {
      // An opening mark with no closing one: keep the words, drop the marker.
      parts.push({ text: rest.slice(0, open) + rest.slice(open + SNIPPET_OPEN.length), hit: false })
      break
    }

    if (open > 0) parts.push({ text: rest.slice(0, open), hit: false })
    parts.push({ text: rest.slice(open + SNIPPET_OPEN.length, close), hit: true })
    rest = rest.slice(close + SNIPPET_CLOSE.length)
  }

  return parts.filter((p) => p.text.length > 0)
}

/** The snippet with its markers removed — for a title attribute, a meta
 *  description, or anywhere the marks would be read aloud as punctuation. */
export function plainSnippet(snippet: string): string {
  return splitSnippet(snippet).map((p) => p.text).join('')
}
