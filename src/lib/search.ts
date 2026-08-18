// Shared search primitives.
//
// Phase 1 needs only the highlighting half — RichText marks the words that
// matched when a reader arrives from a search result. The matchers and the
// results page follow in Phase 5 and build on the same tokens, so the rules for
// what counts as a token live here from the start.

// ── Smart punctuation ────────────────────────────────────────────────────
// Phone keyboards substitute typographic punctuation as you type (iOS "Smart
// Punctuation", on by default; Android's Gboard likewise), so a phrase search
// typed on a phone arrives with curly quotes, not "north sea". On GERS Explorer
// the quote parsing only ever recognised the ASCII form, and the curly ones then
// CLUNG to the words as literal characters, so the query matched nothing at all
// rather than degrading to a two-word search: phrase search on mobile returned
// no results, always.
//
// The same applies to apostrophes, in both directions: prose mixes the two forms
// (a typographic apostrophe in one place, a typewriter one in another), so
// whichever the reader types would otherwise miss half the site.
//
// Both sides of every comparison are folded to the ASCII form. The fold is
// deliberately 1 character → 1 character so string offsets survive it and a
// snippet can still slice the ORIGINAL text by an index found in the folded
// copy. Anything needing a different length (an ellipsis → three dots) does not
// belong here.
//
// ⚠ Written as \u escapes, not glyphs. Several of these are invisible or
// indistinguishable from their ASCII twin in an editor — a literal non-breaking
// space in source is a lint error in most configs for exactly that reason — and
// a reviewer cannot check a table of characters they cannot see.
const FOLD: Record<string, string> = {
  '\u2018': "'",  // left single quote
  '\u2019': "'",  // right single quote - the apostrophe a phone types
  '\u201A': "'",  // single low quote
  '\u201B': "'",  // single high-reversed quote
  '\u2032': "'",  // prime
  '\u201C': '"',  // left double quote
  '\u201D': '"',  // right double quote
  '\u201E': '"',  // double low quote
  '\u201F': '"',  // double high-reversed quote
  '\u2033': '"',  // double prime
  '\u00AB': '"',  // left guillemet
  '\u00BB': '"',  // right guillemet
  '\u2010': '-',  // hyphen
  '\u2011': '-',  // non-breaking hyphen
  '\u2012': '-',  // figure dash
  '\u2013': '-',  // en dash
  '\u2014': '-',  // em dash
  '\u2015': '-',  // horizontal bar
  '\u2212': '-',  // minus sign
  '\u00A0': ' ',  // non-breaking space
}
const FOLDABLE = /[\u2018\u2019\u201A\u201B\u2032\u201C\u201D\u201E\u201F\u2033\u00AB\u00BB\u2010-\u2015\u2212\u00A0]/g

/**
 * Fold typographic punctuation to its ASCII equivalent, one character for one,
 * so a query typed on a phone compares equal to text written with proper quotes,
 * apostrophes, dashes or non-breaking spaces.
 *
 * Matching only — never use this on text about to be displayed.
 */
export function foldPunctuation(s: string): string {
  return s.replace(FOLDABLE, (c) => FOLD[c] ?? c)
}

/** The variants each folded character has to match when a token is turned back
 *  into a regex against unfolded display text — so highlighting marks a word
 *  written with a typographic apostrophe for a query typed with a plain one,
 *  without rewriting what is on screen. */
const VARIANTS: Record<string, string> = {
  "'": "['\u2018\u2019\u201A\u201B\u2032]",
  '"': '["\u201C\u201D\u201E\u201F\u2033\u00AB\u00BB]',
  '-': '[-\u2010-\u2015\u2212]',
  ' ': '[ \u00A0]',
}

/**
 * A regex source matching `token` (a folded token from `tokenize`) against text
 * that may still carry typographic punctuation. Use this rather than a plain
 * escape when highlighting, so the pattern is as forgiving as the match test was
 * — otherwise a query can match the page and then highlight nothing on it.
 */
export function tokenPattern(token: string): string {
  return token
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/['"\- ]/g, (c) => VARIANTS[c])
}

/**
 * Split a raw query into lowercase match tokens.
 *
 * Bare words (≥2 characters) are matched individually; text inside "double
 * quotes" is kept whole as a phrase token, so it only matches where those words
 * appear contiguously. Curly quotes count as quotes — a phone types those. A
 * dangling opening quote is ignored, treated as bare words, so partial typing
 * still searches rather than suddenly returning nothing. Phrases come first so
 * highlighting prefers the longer match.
 */
export function tokenize(q: string): string[] {
  const lower = foldPunctuation(q.trim().toLowerCase())
  if (!lower) return []
  const phrases: string[] = []
  const rest = lower
    .replace(/"([^"]*)"/g, (_full, inner: string) => {
      const phrase = inner.trim()
      if (phrase.length >= 2) phrases.push(phrase)
      return ' '
    })
    .replace(/"/g, ' ') // strip any unmatched quote so it doesn't cling to a word
  const words = rest.split(/\s+/).filter((t) => t.length >= 2)
  return [...phrases, ...words]
}

// ── Matching ─────────────────────────────────────────────────────────────
// Phase 5. A haystack has to be folded before a token is tested against it, or
// the fold has only been applied to one side of the comparison and the query
// that a phone typed still misses text written with typographic punctuation —
// which is the whole failure this file exists to prevent.

/**
 * Prepare text for comparison against tokens from `tokenize`: lowercased, with
 * typographic punctuation folded to ASCII.
 *
 * Matching only. The result is 1:1 in length with the input, so an index found
 * in it still points at the right character of the ORIGINAL — which is what lets
 * `snippet` slice the author's own punctuation out of a match it found here.
 */
export function matchable(s: string): string {
  return foldPunctuation(String(s ?? '').toLowerCase())
}

/** True if `hay` contains every token. Prefer this over an inline `.includes`,
 *  which would compare unfolded text against folded tokens. */
export function matchesAll(hay: string, tokens: string[]): boolean {
  const h = matchable(hay)
  return tokens.every((t) => h.includes(t))
}

/**
 * A short window of `text` centred on the first token that appears in it, for a
 * search result's preview — with ellipses where it has been clipped.
 *
 * Falls back to the opening of the text when no token is present: a post can
 * match on its headline alone, and a result with no second line under it reads
 * as a rendering fault rather than a deliberate absence.
 *
 * `text` is expected to be plain prose already (see lib/markdownText) — a
 * snippet cut out of raw Markdown can open mid-`**` or halfway through a link.
 */
export function snippet(text: string, tokens: string[], radius = 90): string {
  const clean = String(text ?? '').trim()
  if (!clean) return ''
  const lower = matchable(clean)
  let idx = -1
  for (const t of tokens) {
    const i = lower.indexOf(t)
    if (i >= 0 && (idx < 0 || i < idx)) idx = i
  }
  if (idx < 0) return clip(clean, radius * 2)
  // Widen to whole words at both ends, so a snippet never starts or ends
  // mid-word — an ellipsis butted against half a word looks like a bug.
  let start = Math.max(0, idx - radius)
  if (start > 0) {
    const space = clean.indexOf(' ', start)
    start = space >= 0 && space < idx ? space + 1 : start
  }
  let end = Math.min(clean.length, idx + radius)
  if (end < clean.length) {
    const space = clean.lastIndexOf(' ', end)
    end = space > idx ? space : end
  }
  return (start > 0 ? '…' : '') + clean.slice(start, end).trim() + (end < clean.length ? '…' : '')
}

/** The head of `text`, cut on a word boundary. */
function clip(text: string, max: number): string {
  if (text.length <= max) return text
  const window = text.slice(0, max + 1)
  const space = window.lastIndexOf(' ')
  return text.slice(0, space > 0 ? space : max).trimEnd() + '…'
}
