import React from 'react'
import { tokenPattern } from './search'

/**
 * Wrapping search matches in <mark>.
 *
 * Split out of RichText so that file exports components and nothing else, which
 * is what keeps fast refresh working while editing it. These are also used
 * directly on plain text — a post's headline — where the Markdown renderer would
 * be overkill.
 */

export const MARK_STYLE: React.CSSProperties = {
  backgroundColor: '#FDE68A',
  color: 'inherit',
  borderRadius: 2,
  padding: '0 1px',
  boxDecorationBreak: 'clone',
}

/**
 * `tokenPattern` rather than a bare escape: tokens have had their curly
 * quotes/apostrophes/dashes folded to ASCII (see lib/search) while the text being
 * marked has not, so the pattern must accept either form. Otherwise a
 * phone-typed query matches the page and then highlights nothing on it.
 */
const tokensRe = (terms: string[]) =>
  new RegExp('(' + terms.map(tokenPattern).join('|') + ')', 'gi')

/** Split `text` on any of `terms` (case-insensitive), wrapping matches in <mark>.
 *  Returns the plain string when there is nothing to highlight. */
export function highlightText(text: string, terms?: string[]): React.ReactNode {
  const t = (terms ?? []).filter(Boolean)
  if (!t.length) return text
  const parts = text.split(tokensRe(t))
  if (parts.length === 1) return text
  // split() with one capturing group interleaves match/non-match; odd = match.
  return parts.map((part, i) =>
    part === '' ? null : i % 2 === 1 ? <mark key={i} style={MARK_STYLE}>{part}</mark> : part,
  )
}

/** As above but appending into an existing array, keyed under `keyBase` so
 *  <mark>s stay unique across the many text segments of one paragraph. */
export function emitHighlighted(
  out: React.ReactNode[],
  text: string,
  terms: string[] | undefined,
  keyBase: string,
): void {
  const t = (terms ?? []).filter(Boolean)
  if (!t.length) { out.push(text); return }
  const parts = text.split(tokensRe(t))
  if (parts.length === 1) { out.push(text); return }
  parts.forEach((part, i) => {
    if (part === '') return
    if (i % 2 === 1) out.push(<mark key={`${keyBase}-h${i}`} style={MARK_STYLE}>{part}</mark>)
    else out.push(part)
  })
}
