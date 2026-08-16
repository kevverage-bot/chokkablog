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
